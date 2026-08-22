import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import AutomationExecutionLog, AutomationRule
from app.models.conversation import Conversation
from app.models.customer import Customer
from app.models.message import Message

logger = logging.getLogger("AutomationEngine")


class AutomationService:
    @staticmethod
    async def evaluate_inbound_message(
        session: AsyncSession,
        conversation: Conversation,
        customer: Customer,
        text: Optional[str],
    ) -> Optional[Message]:
        if not text or not text.strip():
            return None

        clean_text = text.strip().lower()

        # Query all active rules
        stmt = select(AutomationRule).where(AutomationRule.is_active == True)
        res = await session.execute(stmt)
        rules = list(res.scalars().all())

        if rules:
            conv_brand = (conversation.brand or "").strip()
        conv_channel = conversation.channel.value.lower() if hasattr(conversation.channel, "value") else str(conversation.channel).lower()

        for rule in rules:
            # 1. Brand matching check
            if rule.brand_id:
                target_brand = rule.brand_id.strip()
                if (
                    target_brand.lower() not in ("all", "الكل")
                    and target_brand != conv_brand
                ):
                    continue

            # 2. Channel matching check
            if rule.channels and len(rule.channels) > 0:
                rule_channels_lower = [c.lower() for c in rule.channels]
                if "all" not in rule_channels_lower and conv_channel not in rule_channels_lower:
                    continue

            # 3. Keyword trigger matching check
            matched = False
            keywords = rule.keywords or []
            match_type = (rule.match_type or "contains").lower()

            if match_type == "exact":
                matched = any(kw.strip().lower() == clean_text for kw in keywords if kw.strip())
            elif match_type == "regex":
                for kw in keywords:
                    if not kw.strip():
                        continue
                    try:
                        pattern = re.compile(kw.strip(), re.IGNORECASE)
                        if pattern.search(clean_text):
                            matched = True
                            break
                    except re.error as re_err:
                        logger.warning(f"[Automation Engine] Invalid regex pattern '{kw}' in rule {rule.id}: {re_err}")
            else:  # default 'contains'
                matched = any(kw.strip().lower() in clean_text for kw in keywords if kw.strip())

            if not matched:
                continue

            logger.info(f"[Automation Engine] Keyword match found! Rule: '{rule.name}' (ID: {rule.id}) for Customer: {customer.id}")

            # 4. Cooldown Period Check
            log_stmt = (
                select(AutomationExecutionLog)
                .where(
                    AutomationExecutionLog.rule_id == rule.id,
                    AutomationExecutionLog.customer_id == customer.id,
                )
                .order_by(AutomationExecutionLog.executed_at.desc())
                .limit(1)
            )
            log_res = await session.execute(log_stmt)
            latest_log = log_res.scalar_one_or_none()

            if latest_log and latest_log.executed_at:
                executed_time = latest_log.executed_at
                if executed_time.tzinfo is None:
                    executed_time = executed_time.replace(tzinfo=timezone.utc)

                now_utc = datetime.now(timezone.utc)
                diff_minutes = (now_utc - executed_time).total_seconds() / 60.0

                if diff_minutes < rule.cooldown_minutes:
                    logger.info(
                        f"[Automation Engine] Cooldown active ({diff_minutes:.1f}m < {rule.cooldown_minutes}m) "
                        f"for Rule '{rule.name}' on Customer {customer.id}. Skipping auto-reply."
                    )
                    continue

            # 5. Execute Automation & Record Execution Log
            execution_log = AutomationExecutionLog(
                rule_id=rule.id,
                conversation_id=conversation.id,
                customer_id=customer.id,
                executed_at=datetime.now(timezone.utc),
            )
            session.add(execution_log)
            await session.commit()

            # 6. Execute Multi-Step Actions or Default Single Response
            outbound_msg = None
            try:
                from app.services.message_service import MessageService
                outbound_msg = await MessageService.send_agent_reply(
                    session=session,
                    conversation_id=conversation.id,
                    text=rule.response_text,
                    sender_external_id="automation_bot",
                )
                logger.info(
                    f"✅ [Automation Engine] Successfully dispatched auto-reply for Rule '{rule.name}' "
                    f"to Conversation {conversation.id} (Message ID: {outbound_msg.id})"
                )
            except Exception as dispatch_err:
                logger.error(
                    f"⚠️ [Automation Engine] Meta API dispatch error for Rule '{rule.name}': {dispatch_err}"
                )

            # Check if multi-step timed action sequence exists
            if rule.actions and isinstance(rule.actions, list) and len(rule.actions) > 0:
                import asyncio
                asyncio.create_task(
                    AutomationService.run_action_sequence_background(
                        rule_id=rule.id,
                        conversation_id=conversation.id,
                        actions=rule.actions,
                    )
                )

            # 7. Broadcast via WebSockets if message was created
            if outbound_msg:
                try:
                    from app.api.v1.ws import manager
                    await manager.broadcast({
                        "type": "NEW_MESSAGE",
                        "conversation_id": str(conversation.id),
                        "message": {
                            "id": str(outbound_msg.id),
                            "conversation_id": str(conversation.id),
                            "external_message_id": outbound_msg.external_message_id,
                            "sender_type": "agent",
                            "sender_external_id": "automation_bot",
                            "message_type": "text",
                            "text": outbound_msg.text,
                            "created_at": outbound_msg.created_at.isoformat() if outbound_msg.created_at else datetime.now(timezone.utc).isoformat(),
                            "delivery_status": "delivered",
                        }
                    })
                except Exception as ws_err:
                    logger.warning(f"[Automation Engine] WebSocket broadcast failed: {ws_err}")

            return outbound_msg

        # 8. Unmatched Inbound Routing & Escalation Policy (Track 3)
        if conversation.priority in ["normal", "low"] or not conversation.priority:
            conversation.priority = "urgent"
            await session.commit()
            logger.info("Unmatched conversation escalation: Escalated Conv %s priority to 'urgent'", conversation.id)

            try:
                from app.api.v1.ws import manager
                await manager.broadcast({
                    "type": "conversation:unmatched_escalation",
                    "conversation_id": str(conversation.id),
                    "priority": "urgent",
                    "customer_name": conversation.customer_display_name,
                })
            except Exception as ws_err:
                logger.warning("[Escalation] WebSocket escalation broadcast error: %s", ws_err)

        return None

    @staticmethod
    async def run_action_sequence_background(
        rule_id: uuid.UUID,
        conversation_id: uuid.UUID,
        actions: list[dict],
    ) -> None:
        """Background task runner for timed action sequences (Track 2)."""
        import asyncio
        from app.core.database import AsyncSessionLocal
        from app.services.message_service import MessageService

        for action in actions:
            delay = action.get("delay_seconds", 0)
            if delay > 0:
                logger.info("Automation Action Sequence: Sleeping %ds for Conv %s", delay, conversation_id)
                await asyncio.sleep(delay)

            action_type = action.get("type")
            payload = action.get("payload", {})

            async with AsyncSessionLocal() as session:
                try:
                    if action_type == "SEND_MESSAGE":
                        msg_text = payload.get("text")
                        if msg_text:
                            await MessageService.send_agent_reply(
                                session=session,
                                conversation_id=conversation_id,
                                text=msg_text,
                                sender_external_id="automation_sequence_bot",
                            )
                    elif action_type == "SET_PRIORITY":
                        prio = payload.get("priority", "urgent")
                        stmt = select(Conversation).where(Conversation.id == conversation_id)
                        res = await session.execute(stmt)
                        conv = res.scalar_one_or_none()
                        if conv:
                            conv.priority = prio
                            await session.commit()
                except Exception as step_err:
                    logger.error("Automation Action Sequence error in step %s: %s", action_type, step_err)
