import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import ConversationAssignmentLog
from app.models.conversation import Conversation
from app.models.enums import ConversationStatusEnum, UserRole
from app.models.user import User
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class RoutingService:
    @staticmethod
    async def assign_conversation_smart(
        session: AsyncSession,
        conversation: Conversation,
        strategy: str = "least_loaded",
    ) -> Optional[User]:
        """Automatically route and assign an unassigned conversation to an eligible brand agent."""
        # 1. If already assigned, return assigned user if valid
        if conversation.assigned_agent_id:
            try:
                agent_uuid = uuid.UUID(conversation.assigned_agent_id)
                assigned_agent = await session.get(User, agent_uuid)
                if assigned_agent:
                    return assigned_agent
            except ValueError:
                pass

        # 2. Query all active staff (agents, supervisors, admins)
        stmt = select(User).where(
            User.is_active.is_(True),
            User.role.in_([UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN]),
        )
        res = await session.execute(stmt)
        active_agents = list(res.scalars().all())

        if not active_agents:
            logger.warning("[RoutingService] No active staff accounts available for routing.")
            return None

        # 3. Filter agents eligible for conversation's brand AND channel
        from app.api.deps import user_has_conversation_access
        eligible_agents = [
            agent for agent in active_agents if user_has_conversation_access(agent, conversation)
        ]

        if not eligible_agents:
            conv_brand = getattr(conversation, "brand", "LAVVA") or "LAVVA"
            conv_chan = getattr(conversation, "channel", "messenger")
            logger.warning(
                "[RoutingService] No eligible agents with access to brand '%s' and channel '%s'.",
                conv_brand,
                conv_chan,
            )
            return None

        selected_agent: Optional[User] = None

        # 4. Strategy Selection
        if strategy == "round_robin":
            # Round-Robin: Find agent with oldest assignment timestamp
            agent_ids = [a.id for a in eligible_agents]
            subq = (
                select(
                    ConversationAssignmentLog.assigned_to_user_id,
                    func.max(ConversationAssignmentLog.created_at).label("last_assigned"),
                )
                .where(ConversationAssignmentLog.assigned_to_user_id.in_(agent_ids))
                .group_by(ConversationAssignmentLog.assigned_to_user_id)
            )
            last_assign_res = await session.execute(subq)
            last_assign_map = {row[0]: row[1] for row in last_assign_res.all()}

            # Pick agent with oldest/None last_assigned timestamp
            sorted_agents = sorted(
                eligible_agents,
                key=lambda a: last_assign_map.get(a.id) or datetime.min.replace(tzinfo=timezone.utc)
            )
            selected_agent = sorted_agents[0]
        else:
            # Least-Loaded (Default): Count open assigned conversations per eligible agent
            agent_id_strs = [str(a.id) for a in eligible_agents]
            counts_stmt = (
                select(Conversation.assigned_agent_id, func.count(Conversation.id))
                .where(
                    Conversation.status == ConversationStatusEnum.OPEN,
                    Conversation.assigned_agent_id.in_(agent_id_strs),
                )
                .group_by(Conversation.assigned_agent_id)
            )
            counts_res = await session.execute(counts_stmt)
            counts_map = {row[0]: row[1] for row in counts_res.all()}

            sorted_agents = sorted(
                eligible_agents,
                key=lambda a: counts_map.get(str(a.id), 0)
            )
            selected_agent = sorted_agents[0]

        if not selected_agent:
            return None

        # 5. Persist Assignment to Conversation
        old_agent_id = conversation.assigned_agent_id
        conversation.assigned_agent_id = str(selected_agent.id)

        # Log assignment
        await AuditService.log_assignment(
            session=session,
            conversation_id=conversation.id,
            assigned_by_user_id=None,
            assigned_to_user_id=selected_agent.id,
            previous_agent_id=old_agent_id,
            reason=f"Auto-routed via {strategy}",
        )

        # Broadcast WebSocket event
        try:
            from app.api.v1.ws import manager
            await manager.broadcast({
                "type": "CONVERSATION_ASSIGNED",
                "data": {
                    "conversation_id": str(conversation.id),
                    "assigned_agent_id": str(selected_agent.id),
                    "assigned_agent_name": selected_agent.full_name,
                    "reason": f"Auto-routed via {strategy}",
                }
            })
        except Exception as ws_err:
            logger.warning("[RoutingService] Failed to broadcast assignment WS: %s", ws_err)

        logger.info(
            "✅ [RoutingService] Assigned Conv %s to Agent %s (%s) via strategy '%s'",
            conversation.id,
            selected_agent.id,
            selected_agent.email,
            strategy,
        )

        return selected_agent
