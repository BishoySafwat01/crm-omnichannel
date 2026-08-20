import logging
import uuid
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import ConversationAssignmentLog, UserAuditLog

logger = logging.getLogger(__name__)


class AuditService:
    @staticmethod
    async def log_action(
        session: AsyncSession,
        user_id: Optional[uuid.UUID],
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> UserAuditLog:
        """Create and persist an immutable user audit log record."""
        audit_entry = UserAuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            payload=payload or {},
            ip_address=ip_address,
        )
        session.add(audit_entry)
        try:
            await session.commit()
            await session.refresh(audit_entry)
        except Exception as exc:
            logger.error("[AuditService] Failed to commit UserAuditLog: %s", exc)
            await session.rollback()
        return audit_entry

    @staticmethod
    async def log_assignment(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        assigned_by_user_id: Optional[uuid.UUID],
        assigned_to_user_id: Optional[uuid.UUID],
        previous_agent_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> ConversationAssignmentLog:
        """Log a conversation assignment event in conversation_assignment_logs and user_audit_logs."""
        assignment_log = ConversationAssignmentLog(
            conversation_id=conversation_id,
            assigned_by_user_id=assigned_by_user_id,
            assigned_to_user_id=assigned_to_user_id,
            previous_agent_id=str(previous_agent_id) if previous_agent_id is not None else None,
            reason=reason,
        )
        session.add(assignment_log)

        # Create corresponding UserAuditLog entry
        audit_payload = {
            "conversation_id": str(conversation_id),
            "assigned_to_user_id": str(assigned_to_user_id) if assigned_to_user_id else None,
            "previous_agent_id": str(previous_agent_id) if previous_agent_id else None,
            "reason": reason,
        }

        audit_entry = UserAuditLog(
            user_id=assigned_by_user_id,
            action="conversation.assigned",
            resource_type="conversation",
            resource_id=str(conversation_id),
            payload=audit_payload,
        )
        session.add(audit_entry)

        try:
            await session.commit()
            await session.refresh(assignment_log)
        except Exception as exc:
            logger.error("[AuditService] Failed to commit assignment log: %s", exc)
            await session.rollback()

        return assignment_log
