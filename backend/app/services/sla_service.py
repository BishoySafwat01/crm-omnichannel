import logging
from datetime import datetime, timedelta, timezone
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation

logger = logging.getLogger(__name__)


class SlaService:
    DEFAULT_SLA_MINUTES: int = 15

    @staticmethod
    def start_or_update_sla(
        conversation: Conversation,
        inbound_timestamp: datetime,
    ) -> None:
        """Starts or updates 15-minute response SLA timer for inbound customer messages."""
        if inbound_timestamp.tzinfo is None:
            inbound_timestamp = inbound_timestamp.replace(tzinfo=timezone.utc)

        if conversation.sla_status in ("none", "met", None):
            conversation.sla_status = "pending"
            conversation.sla_due_at = inbound_timestamp + timedelta(minutes=SlaService.DEFAULT_SLA_MINUTES)
            logger.info(
                "🟢 [SLA Engine] Initialized SLA timer for Conv %s (Due at %s)",
                conversation.id,
                conversation.sla_due_at.isoformat(),
            )

    @staticmethod
    def record_first_response(
        conversation: Conversation,
        reply_timestamp: datetime,
    ) -> None:
        """Records agent first response latency and resolves pending SLA timer to 'met' or 'breached'."""
        if reply_timestamp.tzinfo is None:
            reply_timestamp = reply_timestamp.replace(tzinfo=timezone.utc)

        if conversation.sla_status == "pending":
            created_at = conversation.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)

            delta = int((reply_timestamp - created_at).total_seconds())
            conversation.first_response_time_seconds = max(delta, 0)

            sla_due_at = conversation.sla_due_at
            if sla_due_at and sla_due_at.tzinfo is None:
                sla_due_at = sla_due_at.replace(tzinfo=timezone.utc)

            if sla_due_at and reply_timestamp <= sla_due_at:
                conversation.sla_status = "met"
                logger.info(
                    "✅ [SLA Engine] SLA MET for Conv %s (Response time: %ds)",
                    conversation.id,
                    conversation.first_response_time_seconds,
                )
            else:
                conversation.sla_status = "breached"
                logger.warning(
                    "🔴 [SLA Engine] SLA BREACHED for Conv %s (Response time: %ds)",
                    conversation.id,
                    conversation.first_response_time_seconds,
                )

    @staticmethod
    async def evaluate_overdue_conversations(session: AsyncSession) -> List[Conversation]:
        """Scans pending SLA conversations, flags expired timers as 'breached', and elevates priority to 'urgent'."""
        now = datetime.now(timezone.utc)

        stmt = select(Conversation).where(
            Conversation.sla_status == "pending",
            Conversation.sla_due_at.is_not(None),
            Conversation.sla_due_at < now,
        )
        res = await session.execute(stmt)
        overdue_conversations = list(res.scalars().all())

        if not overdue_conversations:
            return []

        for conv in overdue_conversations:
            conv.sla_status = "breached"
            conv.priority = "urgent"

            try:
                from app.api.v1.ws import manager
                await manager.broadcast({
                    "type": "SLA_BREACHED",
                    "data": {
                        "conversation_id": str(conv.id),
                        "brand": conv.brand,
                        "sla_due_at": conv.sla_due_at.isoformat() if conv.sla_due_at else None,
                        "priority": "urgent",
                    }
                })
            except Exception as ws_err:
                logger.warning("[SLA Engine] Failed to broadcast SLA_BREACHED WS: %s", ws_err)

            logger.warning(
                "🔴 [SLA Engine] SLA Breached & Priority Escalated to Urgent for Conv %s (Brand: %s)",
                conv.id,
                conv.brand,
            )

        await session.commit()
        return overdue_conversations
