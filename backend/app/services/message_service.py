import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import case, func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.core.config import settings
from app.core.country_detector import CountryDetector
from app.integrations.base import BaseMessagingProvider
from app.integrations.factory import ProviderFactory
from app.integrations.meta import MetaProvider
from app.models.connected_page import ConnectedPage
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum
from app.models.message import Message
from app.infrastructure.realtime.ws_broadcaster import ws_broadcaster
from app.schemas.messaging import AgentReplyResultDTO, MessageResponse
from app.services.conversation_service import ConversationService

logger = logging.getLogger("MessageService")


class MessageService:
    LOCATION_PROMPT = "أهلاً بك، من أي دولة ومدينتك الكريمة لتأكيد التوصيل؟"

    @staticmethod
    async def process_new_inbound_location(
        session: AsyncSession,
        conversation: Conversation,
        text: Optional[str],
        customer: Optional[Customer] = None,
    ) -> None:
        """Extract location, or ask once, during a conversation's opening exchange."""
        if not text or not text.strip() or not conversation.customer_id:
            return

        customer = customer or await session.get(Customer, conversation.customer_id)
        if not customer:
            return

        # Message evidence always wins, even outside the opening exchange. In
        # particular, a flag reply must be persisted before any prompt gates.
        country, city = ConversationService.extract_arab_location(text)
        if country:
            customer.country = country
            customer.location = city or country
        if city:
            customer.city = city
            customer.country = country
            customer.location = city
        if country or city:
            session.add(customer)
            await session.commit()
            return

        # A stored country is sufficient to suppress the country/city prompt.
        # Asking for a missing city must be handled by a separate, city-only flow.
        if customer.country and customer.country.strip():
            return

        customer_message_count = (
            await session.execute(
                select(func.count(Message.id)).where(
                    Message.conversation_id == conversation.id,
                    Message.sender_type == SenderTypeEnum.CUSTOMER,
                    Message.deleted_at.is_(None),
                )
            )
        ).scalar_one()
        is_first_customer_message = customer_message_count == 1

        awaiting_location_reply = False
        if not is_first_customer_message and (not customer.city or not customer.country):
            awaiting_location_reply = (
                await session.execute(
                    select(Message.id)
                    .where(
                        Message.conversation_id == conversation.id,
                        Message.sender_type == SenderTypeEnum.AGENT,
                        Message.metadata_.contains({"location_prompt": True}),
                        Message.deleted_at.is_(None),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none() is not None

        if not is_first_customer_message and not awaiting_location_reply:
            return

        page = None
        if conversation.connected_page_id:
            page = await session.get(ConnectedPage, conversation.connected_page_id)
        elif conversation.page_id:
            page = (
                await session.execute(
                    select(ConnectedPage).where(
                        ConnectedPage.page_id == conversation.page_id,
                        ConnectedPage.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()

        inferred_country = ConversationService.infer_country_from_context(
            conversation.brand,
            getattr(conversation, "default_country", None),
            getattr(conversation, "currency", None),
            page.name if page else None,
            page.category if page else None,
            getattr(page, "default_country", None) if page else None,
            getattr(page, "country", None) if page else None,
            getattr(page, "currency", None) if page else None,
        )
        if inferred_country:
            customer.country = inferred_country
            customer.location = customer.location or inferred_country
            session.add(customer)
            await session.commit()
            return

        if not is_first_customer_message:
            return

        await MessageService.send_agent_reply(
            session=session,
            conversation_id=conversation.id,
            text=MessageService.LOCATION_PROMPT,
            sender_external_id="automation_bot",
            metadata_={
                "is_automated": True,
                "is_bot": True,
                "location_prompt": True,
            },
            sender_name="مساعد التوصيل",
        )

    @staticmethod
    def _is_automated_reply(
        metadata: Optional[dict[str, Any]], sender_external_id: Optional[str]
    ) -> bool:
        metadata = metadata or {}
        return bool(
            metadata.get("is_automated")
            or metadata.get("is_bot")
            or sender_external_id == "automation_bot"
        )

    @staticmethod
    def should_increment_inbound_unread(
        sender_type: SenderTypeEnum,
        message_created_at: Optional[datetime],
        received_at: Optional[datetime] = None,
    ) -> bool:
        """Return whether an inbound message belongs to today's live unread window."""
        if sender_type != SenderTypeEnum.CUSTOMER:
            return False

        received_utc = received_at or datetime.now(timezone.utc)
        if received_utc.tzinfo is None:
            received_utc = received_utc.replace(tzinfo=timezone.utc)
        else:
            received_utc = received_utc.astimezone(timezone.utc)

        created_utc = message_created_at or received_utc
        if created_utc.tzinfo is None:
            created_utc = created_utc.replace(tzinfo=timezone.utc)
        else:
            created_utc = created_utc.astimezone(timezone.utc)

        today_baseline = received_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        return created_utc >= today_baseline

    @staticmethod
    async def _broadcast_automation_visibility_sync(
        conversation: Conversation,
    ) -> None:
        """Refresh chat lists after a bot reply clears the unread state."""
        try:
            await ws_broadcaster.broadcast_event(
                target="conversation",
                conversation_id=str(conversation.id),
                payload={
                    "type": "CONVERSATION_UPDATED",
                    "conversation_id": str(conversation.id),
                    "unread_count": 0,
                    "is_unread": False,
                    "last_message_at": (
                        conversation.last_message_at.isoformat()
                        if conversation.last_message_at
                        else None
                    ),
                    "last_sender_type": SenderTypeEnum.AGENT.value,
                },
            )
        except Exception as ws_err:
            logger.warning(
                "[Automation] Failed to broadcast conversation visibility sync: %s",
                ws_err,
            )

    @staticmethod
    async def create_message(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        sender_type: SenderTypeEnum,
        external_message_id: Optional[str] = None,
        sender_external_id: Optional[str] = None,
        message_type: MessageTypeEnum = MessageTypeEnum.TEXT,
        text: Optional[str] = None,
        metadata_: Optional[dict[str, Any]] = None,
        created_at: Optional[datetime] = None,
    ) -> Message:
        received_at = datetime.now(timezone.utc)
        stmt = select(Conversation).where(Conversation.id == conversation_id)
        result = await session.execute(stmt)
        conversation = result.scalar_one_or_none()

        is_customer_message = sender_type == SenderTypeEnum.CUSTOMER

        message = Message(
            conversation_id=conversation_id,
            external_message_id=external_message_id,
            sender_type=sender_type,
            sender_external_id=sender_external_id,
            message_type=message_type,
            text=text,
            metadata_=metadata_ or {},
            created_at=created_at or received_at,
        )
        session.add(message)

        customer = None
        if conversation:
            now = datetime.now(timezone.utc)
            conversation.last_message_at = now
            conversation.last_activity_at = now
            if sender_type == SenderTypeEnum.CUSTOMER:
                conversation.last_customer_message_at = now

            if conversation.customer_id:
                cust_stmt = select(Customer).where(Customer.id == conversation.customer_id)
                cust_res = await session.execute(cust_stmt)
                customer = cust_res.scalar_one_or_none()
                if customer:
                    customer.last_activity_at = now
                    session.add(customer)

                if sender_type == SenderTypeEnum.CUSTOMER:
                    try:
                        from app.services.customer_timeline_service import CustomerTimelineService
                        chan_str = conversation.channel.value if hasattr(conversation.channel, "value") else str(conversation.channel)
                        cust_name = (customer.display_name if customer else None) or "العميل"
                        await CustomerTimelineService.record_event(
                            session=session,
                            customer_id=conversation.customer_id,
                            event_type="message.inbound",
                            channel=chan_str,
                            summary=f"أرسل {cust_name} رسالة جديدة عبر {chan_str}",
                            details={
                                "text": text[:150] if text else "رسالة جديدة",
                                "conversation_id": str(conversation.id),
                                "brand": getattr(conversation, "brand", "LAVVA"),
                                "channel": chan_str,
                            },
                        )
                    except Exception as tl_in_err:
                        logger.error("[Customer 360 Timeline] Error logging inbound message: %s", tl_in_err)

        await session.flush()
        if conversation:
            await ConversationService.sync_unread_state_with_latest_message(
                session=session,
                conversation=conversation,
                increment_customer=MessageService.should_increment_inbound_unread(
                    sender_type=sender_type,
                    message_created_at=message.created_at,
                    received_at=received_at,
                ),
            )

        await session.commit()
        await session.refresh(message)

        # Broadcast real-time NEW_MESSAGE event across worker processes
        try:
            msg_data = {
                "id": str(message.id),
                "conversation_id": str(conversation_id),
                "external_message_id": message.external_message_id,
                "sender_type": message.sender_type.value if hasattr(message.sender_type, "value") else str(message.sender_type),
                "sender_external_id": message.sender_external_id,
                "message_type": message.message_type.value if hasattr(message.message_type, "value") else str(message.message_type),
                "text": message.text,
                "metadata": message.metadata_,
                "metadata_": message.metadata_,
                "created_at": message.created_at.isoformat() if message.created_at else None,
                "brand": getattr(conversation, "brand", None) if conversation else None,
            }
            await ws_broadcaster.broadcast_event(
                target="conversation",
                conversation_id=str(conversation_id),
                payload={
                    "type": "NEW_MESSAGE",
                    "conversation_id": str(conversation_id),
                    "brand": getattr(conversation, "brand", None) if conversation else None,
                    "message": msg_data,
                },
            )
        except Exception as ws_err:
            logger.debug("[MessageService] Real-time broadcast exception: %s", ws_err)

        if conversation and is_customer_message:
            try:
                await MessageService.process_new_inbound_location(
                    session=session,
                    conversation=conversation,
                    customer=customer,
                    text=text,
                )
            except Exception as prompt_err:
                logger.error(
                    "[Location Extraction] Failed to process conversation %s: %s",
                    conversation_id,
                    prompt_err,
                    exc_info=True,
                )

        return message

    @staticmethod
    async def list_messages_for_conversation(
        session: AsyncSession, conversation_id: uuid.UUID, limit: Optional[int] = 100
    ) -> list[Message]:
        stmt = (
            select(Message)
            .options(selectinload(Message.sender_user))
            .where(
                Message.conversation_id == conversation_id,
                Message.deleted_at.is_(None),
            )
            .order_by(Message.created_at.asc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_paginated_messages(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        order: str = "asc",
    ) -> tuple[list[Message], int]:
        conv_stmt = select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.deleted_at.is_(None),
        )
        conv_res = await session.execute(conv_stmt)
        if not conv_res.scalar_one_or_none():
            raise ValueError(f"Conversation {conversation_id} not found.")

        count_stmt = select(func.count(Message.id)).where(
            Message.conversation_id == conversation_id,
            Message.deleted_at.is_(None),
        )
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = (
            select(Message)
            .options(selectinload(Message.sender_user))
            .where(
                Message.conversation_id == conversation_id,
                Message.deleted_at.is_(None),
            )
        )
        order_str = str(getattr(order, "default", order) or "asc").lower()
        if order_str == "desc":
            stmt = stmt.order_by(Message.created_at.desc(), Message.id.desc())
        else:
            stmt = stmt.order_by(Message.created_at.asc(), Message.id.asc())

        try:
            p = int(getattr(page, "default", page) if page is not None else 1)
        except (ValueError, TypeError):
            p = 1
        try:
            ps = int(getattr(page_size, "default", page_size) if page_size is not None else 20)
        except (ValueError, TypeError):
            ps = 20
        p = max(1, p)
        ps = max(1, min(ps, 500))

        stmt = stmt.offset((p - 1) * ps).limit(ps)
        res = await session.execute(stmt)
        messages = list(res.scalars().all())
        return messages, total

    @staticmethod
    async def send_agent_reply(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        text: Optional[str] = None,
        attachments: Optional[list[dict[str, Any]]] = None,
        tag: Optional[str] = None,
        sender_external_id: Optional[str] = None,
        provider_adapter: Optional[Any] = None,
        sender_user_id: Optional[uuid.UUID] = None,
        reply_to: Optional[dict[str, Any]] = None,
        forwarded_from: Optional[dict[str, Any]] = None,
        metadata_: Optional[dict[str, Any]] = None,
        sender_name: Optional[str] = None,
    ) -> AgentReplyResultDTO:
        clean_text = (text or "").strip()
        if not clean_text and not attachments:
            raise ValueError("Message text cannot be empty or whitespace only.")
        if len(clean_text) > 2000:
            raise ValueError("Message text exceeds maximum length of 2000 characters.")

        is_automated_reply = MessageService._is_automated_reply(
            metadata_, sender_external_id
        )

        # Load Conversation with eager-loaded customer
        stmt = (
            select(Conversation)
            .options(selectinload(Conversation.customer))
            .where(Conversation.id == conversation_id)
        )
        res = await session.execute(stmt)
        conv = res.scalar_one_or_none()

        if not conv:
            raise ValueError(f"Conversation {conversation_id} not found.")

        if conv.customer and getattr(conv.customer, "is_blocked", False):
            raise ValueError("العميل محظور حالياً من قِبل الإدارة. يرجى إلغاء الحظر أولاً لتتمكن من إرسال الرسائل.")

        # Resolve page_id from conversation context
        conv_page_id = getattr(conv, "page_id", None)
        if not conv_page_id and getattr(conv, "connected_page_id", None):
            try:
                from app.models.connected_page import ConnectedPage
                cp = await session.get(ConnectedPage, conv.connected_page_id)
                if cp and cp.page_id:
                    conv_page_id = cp.page_id
            except Exception:
                pass

        if not conv_page_id:
            conv_meta = getattr(conv, "metadata_", None) or getattr(conv, "metadata", None)
            if conv_meta and isinstance(conv_meta, dict):
                conv_page_id = conv_meta.get("page_id")
        if not conv_page_id and getattr(conv, "sender_external_id", None):
            conv_page_id = getattr(conv, "sender_external_id", None)

        # Step A: Lookup ConnectedPage by conversation brand from PostgreSQL
        if not conv_page_id and conv.brand:
            try:
                from app.models.connected_page import ConnectedPage
                stmt_cp = select(ConnectedPage).where(
                    ConnectedPage.name == conv.brand,
                    ConnectedPage.status == "ACTIVE",
                    ConnectedPage.deleted_at.is_(None),
                )
                cp_row = (await session.execute(stmt_cp)).scalars().first()
                if cp_row and cp_row.page_id:
                    conv_page_id = cp_row.page_id
            except Exception as exc:
                logger.debug("Failed to resolve page_id by conv.brand: %s", exc)


        # Step B: Lookup recipient ID recorded in recent customer messages
        if not conv_page_id:
            try:
                msg_stmt = (
                    select(Message)
                    .where(
                        Message.conversation_id == conv.id,
                        Message.sender_type == SenderTypeEnum.CUSTOMER,
                        Message.deleted_at.is_(None),
                    )
                    .order_by(Message.created_at.desc())
                    .limit(1)
                )
                last_cust_msg = (await session.execute(msg_stmt)).scalars().first()
                if last_cust_msg and last_cust_msg.metadata_ and isinstance(last_cust_msg.metadata_, dict):
                    raw = last_cust_msg.metadata_.get("raw") or {}
                    if isinstance(raw, dict) and raw.get("recipient", {}).get("id"):
                        conv_page_id = str(raw["recipient"]["id"])
                    elif last_cust_msg.metadata_.get("page_id"):
                        conv_page_id = str(last_cust_msg.metadata_["page_id"])
            except Exception as exc:
                logger.debug("Failed to resolve page_id from customer message metadata: %s", exc)

        # Step C: Lookup active ConnectedPage matching channel
        if not conv_page_id:
            try:
                from app.models.connected_page import ConnectedPage
                if conv.channel == ChannelEnum.INSTAGRAM:
                    stmt_cp = select(ConnectedPage).where(
                        ConnectedPage.instagram_business_account_id.isnot(None),
                        ConnectedPage.status == "ACTIVE",
                        ConnectedPage.deleted_at.is_(None),
                    ).limit(1)
                    cp_row = (await session.execute(stmt_cp)).scalars().first()
                    if cp_row:
                        conv_page_id = cp_row.instagram_business_account_id or cp_row.page_id
                else:
                    stmt_cp = select(ConnectedPage).where(
                        ConnectedPage.status == "ACTIVE",
                        ConnectedPage.deleted_at.is_(None),
                    ).limit(1)
                    cp_row = (await session.execute(stmt_cp)).scalars().first()
                    if cp_row and cp_row.page_id:
                        conv_page_id = cp_row.page_id
            except Exception as exc:
                logger.debug("Failed to resolve page_id from active ConnectedPages: %s", exc)

        # Step D: Fallback to static settings
        if not conv_page_id and conv.brand:
            for pid, pdata in settings.get_meta_pages().items():
                if pdata.get("name") == conv.brand:
                    conv_page_id = pid
                    break

        if not conv_page_id and settings.META_PAGE_ID:
            conv_page_id = settings.META_PAGE_ID

        # Dynamically resolve messaging adapter via ProviderFactory with active db session
        adapter = provider_adapter or ProviderFactory.get_provider(
            provider_name=conv.provider,
            channel=conv.channel,
            page_id=conv_page_id,
            db=session,
        )
        default_sender = conv_page_id or settings.META_PAGE_ID or "crm_agent"

        # Tiered Recipient PSID / External User ID Resolution:
        clean_recipient = None

        # 1. Fetch all identities for this customer & channel
        all_identities_stmt = (
            select(CustomerIdentity)
            .where(
                CustomerIdentity.customer_id == conv.customer_id,
                CustomerIdentity.channel == conv.channel,
            )
            .order_by(
                case((CustomerIdentity.provider == ProviderEnum.META, 1), else_=2)
            )
        )
        all_identities = (await session.execute(all_identities_stmt)).scalars().all()

        # 1a. Identity specifically matching this page_id or brand in its metadata
        if conv_page_id or conv.brand:
            for ident in all_identities:
                meta = getattr(ident, "metadata_", None) or {}
                if isinstance(meta, dict):
                    if conv_page_id and str(meta.get("page_id", "")).strip() == str(conv_page_id).strip():
                        clean_recipient = ident.external_user_id.strip()
                        break
                    if conv.brand and str(meta.get("brand", "")).strip().lower() == str(conv.brand).strip().lower():
                        clean_recipient = ident.external_user_id.strip()
                        break

        # 2. Look up the most recent inbound customer message in THIS conversation
        # (Contains the exact Page-Scoped User ID assigned by Meta for this page)
        if not clean_recipient or clean_recipient.startswith("t_"):
            try:
                cust_msg_stmt = (
                    select(Message)
                    .where(
                        Message.conversation_id == conv.id,
                        Message.sender_type == SenderTypeEnum.CUSTOMER,
                        Message.deleted_at.is_(None),
                    )
                    .order_by(Message.created_at.desc())
                    .limit(1)
                )
                last_cust_msg = (await session.execute(cust_msg_stmt)).scalars().first()
                if last_cust_msg:
                    if last_cust_msg.sender_external_id and not str(last_cust_msg.sender_external_id).startswith("t_"):
                        clean_recipient = str(last_cust_msg.sender_external_id).strip()
                    elif last_cust_msg.metadata_ and isinstance(last_cust_msg.metadata_, dict):
                        raw_sender = last_cust_msg.metadata_.get("raw", {}).get("sender", {}).get("id")
                        if raw_sender and not str(raw_sender).startswith("t_"):
                            clean_recipient = str(raw_sender).strip()
            except Exception as exc:
                logger.debug("Failed to extract recipient PSID from customer message: %s", exc)

        # 3. Extract PSID from conv.external_conversation_id if formatted with resp_conv_ or conv_
        if (not clean_recipient or clean_recipient.startswith("t_")) and conv.external_conversation_id:
            ext_conv = conv.external_conversation_id.strip()
            if ext_conv.startswith("resp_conv_"):
                candidate = ext_conv[len("resp_conv_"):].strip()
                if candidate and not candidate.startswith("t_"):
                    clean_recipient = candidate
            elif ext_conv.startswith("conv_"):
                candidate = ext_conv[len("conv_"):].strip()
                if candidate and not candidate.startswith("t_"):
                    clean_recipient = candidate

        # 4. Fallback to any valid customer identity (preferring META provider)
        if not clean_recipient or clean_recipient.startswith("t_"):
            meta_identities = [i for i in all_identities if i.provider == ProviderEnum.META and not i.external_user_id.startswith("t_")]
            if meta_identities:
                clean_recipient = meta_identities[0].external_user_id.strip()
            elif all_identities:
                valid_identities = [i for i in all_identities if not i.external_user_id.startswith("t_")]
                if valid_identities:
                    clean_recipient = valid_identities[0].external_user_id.strip()

        # 5. Non-Meta channels fallback (WhatsApp, Telegram, etc.)
        if not clean_recipient and conv.external_conversation_id and conv.provider != ProviderEnum.META:
            clean_recipient = conv.external_conversation_id.strip()

        if not clean_recipient:
            raise ValueError(
                f"Customer recipient identity not found for conversation {conversation_id}."
            )

        if clean_recipient.startswith("t_"):
            clean_recipient = clean_recipient[2:]

        # 6. Auto-Repair / Sync: ensure CustomerIdentity exists with page_id & brand metadata
        try:
            matched_ident = next((i for i in all_identities if i.external_user_id == clean_recipient), None)
            if matched_ident:
                m = dict(getattr(matched_ident, "metadata_", {}) or {})
                needs_update = False
                if conv_page_id and m.get("page_id") != conv_page_id:
                    m["page_id"] = conv_page_id
                    needs_update = True
                if conv.brand and m.get("brand") != conv.brand:
                    m["brand"] = conv.brand
                    needs_update = True
                if needs_update:
                    matched_ident.metadata_ = m
                    session.add(matched_ident)
            else:
                new_ident = CustomerIdentity(
                    customer_id=conv.customer_id,
                    provider=conv.provider,
                    channel=conv.channel,
                    external_user_id=clean_recipient,
                    metadata_={"page_id": conv_page_id, "brand": conv.brand},
                )
                session.add(new_ident)
        except Exception as repair_exc:
            logger.debug("Identity auto-repair non-fatal notice: %s", repair_exc)

        # Idempotency Check BEFORE external API dispatch
        if clean_text:
            recent_agent_stmt = (
                select(Message)
                .where(
                    Message.conversation_id == conv.id,
                    Message.sender_type == SenderTypeEnum.AGENT,
                    Message.text == clean_text,
                    Message.deleted_at.is_(None),
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            recent_agent_msg = (await session.execute(recent_agent_stmt)).scalar_one_or_none()
            if recent_agent_msg and recent_agent_msg.created_at:
                msg_time = recent_agent_msg.created_at
                if msg_time.tzinfo is None:
                    msg_time = msg_time.replace(tzinfo=timezone.utc)
                diff_sec = (datetime.now(timezone.utc) - msg_time).total_seconds()
                if diff_sec < 2.0:
                    logger.warning("[Idempotency] Duplicate outbound message detected within 2s for conversation %s. Skipping duplicate dispatch.", conv.id)
                    await ConversationService.sync_unread_state_with_latest_message(session, conv)
                    if is_automated_reply:
                        conv.unread_count = 0
                        conv.is_unread = False
                        if not conv.last_message_at:
                            conv.last_message_at = msg_time
                        if not conv.last_activity_at:
                            conv.last_activity_at = msg_time
                    await session.commit()
                    if is_automated_reply:
                        await MessageService._broadcast_automation_visibility_sync(conv)
                    return recent_agent_msg

        # Send message through adapter (Check binary file attachment upload for Meta)
        has_media = attachments and len(attachments) > 0
        if has_media and hasattr(adapter, "send_outbound_attachment"):
            first_att = attachments[0]
            att_url = first_att.get("url", "")
            att_type = first_att.get("type", "file") or "file"
            import os
            filename = os.path.basename(att_url)
            ext_lower = filename.lower()
            if ext_lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")):
                att_type = "image"
            elif ext_lower.endswith((".mp4", ".mov", ".avi", ".mkv", ".ogv")):
                att_type = "video"
            elif ext_lower.endswith((".ogg", ".opus", ".mp3", ".m4a", ".wav", ".aac")):
                att_type = "audio"
            elif ext_lower.endswith(".webm"):
                if "voice_" in ext_lower or first_att.get("type") == "audio" or "audio" in first_att.get("mime_type", ""):
                    att_type = "audio"
                else:
                    att_type = "video" if first_att.get("type") == "video" else "audio"

            file_path = os.path.join(settings.UPLOAD_DIR, filename)

            if not os.path.exists(file_path):
                file_path = os.path.join("/app/uploads", filename)
            if not os.path.exists(file_path):
                file_path = os.path.join(os.getcwd(), "uploads", filename)

            if att_type == "audio" and ext_lower.endswith(".webm"):
                transcoded_path = os.path.join(settings.UPLOAD_DIR, f"{os.path.splitext(filename)[0]}.m4a")
                if not os.path.exists(transcoded_path):
                    from app.infrastructure.media.audio_transcoder import transcode_to_m4a
                    import asyncio
                    await asyncio.to_thread(transcode_to_m4a, file_path, transcoded_path)
                if os.path.exists(transcoded_path):
                    file_path = transcoded_path
                    m4a_filename = os.path.basename(transcoded_path)
                    m4a_url = f"/uploads/{m4a_filename}"
                    first_att["url"] = m4a_url
                    if attachments:
                        attachments[0]["url"] = m4a_url

            try:
                outbound_res = await adapter.send_outbound_attachment(
                    recipient_external_id=clean_recipient,
                    file_path=file_path if os.path.exists(file_path) else att_url,
                    attachment_type=att_type,
                    page_id=conv_page_id,
                    tag=tag,
                    db=session,
                    channel=conv.channel,
                )
            except TypeError:
                try:
                    outbound_res = await adapter.send_outbound_attachment(
                        recipient_external_id=clean_recipient,
                        file_path=file_path if os.path.exists(file_path) else att_url,
                        attachment_type=att_type,
                        page_id=conv_page_id,
                        tag=tag,
                        channel=conv.channel,
                    )
                except TypeError:
                    outbound_res = await adapter.send_outbound_attachment(
                        recipient_external_id=clean_recipient,
                        file_path=file_path if os.path.exists(file_path) else att_url,
                        attachment_type=att_type,
                        tag=tag,
                    )
        elif provider_adapter is not None:
            if tag:
                try:
                    outbound_res = await adapter.send_outbound_message(
                        recipient_external_id=clean_recipient,
                        text=clean_text,
                        page_id=conv_page_id,
                        tag=tag,
                        db=session,
                        channel=conv.channel,
                    )
                except TypeError:
                    try:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                            page_id=conv_page_id,
                            tag=tag,
                            channel=conv.channel,
                        )
                    except TypeError:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                            tag=tag,
                        )
            else:
                try:
                    outbound_res = await adapter.send_outbound_message(
                        recipient_external_id=clean_recipient,
                        text=clean_text,
                        page_id=conv_page_id,
                        db=session,
                        channel=conv.channel,
                    )
                except TypeError:
                    try:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                            page_id=conv_page_id,
                            channel=conv.channel,
                        )
                    except TypeError:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                        )
        elif conv.channel == ChannelEnum.INSTAGRAM:
            from app.services.meta_instagram_service import MetaInstagramService
            outbound_res = await MetaInstagramService.send_text_message(
                recipient_id=clean_recipient,
                text=clean_text,
                page_id=conv_page_id,
                session=session,
            )
        elif conv.channel == ChannelEnum.WHATSAPP:
            recipient_phone = (conv.customer.phone if conv.customer else None) or clean_recipient
            try:
                from app.integrations.whatsapp_cloud_adapter import whatsapp_cloud_adapter
                outbound_res = await whatsapp_cloud_adapter.send_text_message(
                    recipient_phone=recipient_phone,
                    text=clean_text,
                )
            except Exception as wa_err:
                logger.warning("[WhatsApp Dispatch] Falling back to MetaWhatsAppOutboundService: %s", wa_err)
                from app.services.meta_whatsapp_outbound_service import MetaWhatsAppOutboundService
                outbound_res = await MetaWhatsAppOutboundService.send_text_message(
                    recipient_phone=recipient_phone,
                    text=clean_text,
                )
        else:
            if tag:
                try:
                    outbound_res = await adapter.send_outbound_message(
                        recipient_external_id=clean_recipient,
                        text=clean_text,
                        page_id=conv_page_id,
                        tag=tag,
                        db=session,
                        channel=conv.channel,
                    )
                except TypeError:
                    try:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                            page_id=conv_page_id,
                            tag=tag,
                            channel=conv.channel,
                        )
                    except TypeError:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                            tag=tag,
                        )
            else:
                try:
                    outbound_res = await adapter.send_outbound_message(
                        recipient_external_id=clean_recipient,
                        text=clean_text,
                        page_id=conv_page_id,
                        db=session,
                        channel=conv.channel,
                    )
                except TypeError:
                    try:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                            page_id=conv_page_id,
                            channel=conv.channel,
                        )
                    except TypeError:
                        outbound_res = await adapter.send_outbound_message(
                            recipient_external_id=clean_recipient,
                            text=clean_text,
                        )

        ext_msg_id = None
        if isinstance(outbound_res, dict):
            ext_msg_id = (
                outbound_res.get("external_message_id")
                or outbound_res.get("message_id")
                or outbound_res.get("id")
            )

        # Idempotency Check
        if ext_msg_id:
            existing_stmt = select(Message).where(
                Message.conversation_id == conv.id,
                Message.external_message_id == ext_msg_id,
            )
            existing_res = await session.execute(existing_stmt)
            existing_msg = existing_res.scalar_one_or_none()
            if existing_msg:
                await ConversationService.sync_unread_state_with_latest_message(session, conv)
                if is_automated_reply:
                    conv.unread_count = 0
                    conv.is_unread = False
                    if existing_msg.created_at:
                        if not conv.last_message_at:
                            conv.last_message_at = existing_msg.created_at
                        if not conv.last_activity_at:
                            conv.last_activity_at = existing_msg.created_at
                await session.commit()
                if is_automated_reply:
                    await MessageService._broadcast_automation_visibility_sync(conv)
                return existing_msg

        # Determine Message Type
        msg_type = MessageTypeEnum.TEXT
        if attachments and len(attachments) > 0:
            a_type = attachments[0].get("type", "file")
            if a_type == "audio":
                msg_type = MessageTypeEnum.AUDIO
            elif a_type == "image":
                msg_type = MessageTypeEnum.IMAGE
            elif a_type == "video":
                msg_type = MessageTypeEnum.VIDEO
            else:
                msg_type = MessageTypeEnum.FILE

        agent_id = sender_external_id or default_sender
        now_utc = datetime.now(timezone.utc)

        metadata_dict = {
            "recipient_id": clean_recipient,
            "provider_response": outbound_res.get("raw", {}) if isinstance(outbound_res, dict) else {},
        }
        if attachments:
            metadata_dict["attachments"] = attachments
        if reply_to:
            metadata_dict["reply_to"] = reply_to
        if forwarded_from:
            metadata_dict["forwarded"] = True
            metadata_dict["forwarded_from"] = forwarded_from
        if metadata_:
            metadata_dict.update(metadata_)

        resolved_sender_name = sender_name
        if not resolved_sender_name and sender_user_id:
            from app.models.user import User
            user_obj = await session.get(User, sender_user_id)
            if user_obj and user_obj.full_name:
                resolved_sender_name = user_obj.full_name
        if not resolved_sender_name and metadata_ and metadata_.get("bot_sender_name"):
            resolved_sender_name = metadata_["bot_sender_name"]

        db_text = clean_text if clean_text != "مرفق وسائط" else ""
        if has_media and (not clean_text or clean_text == "مرفق وسائط"):
            db_text = None

        new_message = Message(
            conversation_id=conv.id,
            external_message_id=ext_msg_id,
            sender_type=SenderTypeEnum.AGENT,
            sender_external_id=agent_id,
            sender_user_id=sender_user_id,
            message_type=msg_type,
            text=db_text,
            metadata_=metadata_dict,
            created_at=now_utc,
        )
        session.add(new_message)
        conv.last_message_at = now_utc
        conv.last_activity_at = now_utc
        await session.flush()
        await ConversationService.sync_unread_state_with_latest_message(session, conv)
        if is_automated_reply:
            conv.unread_count = 0
            conv.is_unread = False

        # Record agent response for SLA tracking
        try:
            from app.services.sla_service import SlaService
            SlaService.record_first_response(conv, now_utc)
        except Exception as sla_err:
            logger.error("[SLA Engine] Error recording first response: %s", sla_err)

        # Record Customer 360 Timeline event
        if conv.customer_id:
            try:
                from app.services.customer_timeline_service import CustomerTimelineService
                chan_str = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
                sender_display_name = resolved_sender_name or "موظف الدعم"

                await CustomerTimelineService.record_event(
                    session=session,
                    customer_id=conv.customer_id,
                    event_type="message.outbound",
                    channel=chan_str,
                    summary=f"{sender_display_name} رد على العميل عبر {chan_str}",
                    details={
                        "text": db_text[:150] if db_text else "مرفق وسائط",
                        "sender_user_id": str(sender_user_id) if sender_user_id else None,
                        "sender_name": sender_display_name,
                        "brand": getattr(conv, "brand", "LAVVA"),
                        "conversation_id": str(conv.id),
                        "channel": chan_str,
                    },
                )
                # Update customer's last_activity_at
                cust_for_act = await session.get(Customer, conv.customer_id)
                if cust_for_act:
                    cust_for_act.last_activity_at = now_utc
                    session.add(cust_for_act)
            except Exception as tl_err:
                logger.error("[Customer 360 Timeline] Error logging outbound message: %s", tl_err)

        # Record Centralized UserAuditLog entry for agent message
        try:
            from app.services.audit_service import AuditService
            chan_str = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
            is_media = msg_type != MessageTypeEnum.TEXT
            action_name = "message.media_sent" if is_media else "message.sent"
            
            audit_pl = {
                "conversation_id": str(conv.id),
                "customer_id": str(conv.customer_id) if conv.customer_id else None,
                "message_id": str(new_message.id),
                "message_type": msg_type.value if hasattr(msg_type, "value") else str(msg_type),
                "channel": chan_str,
                "brand": getattr(conv, "brand", "LAVVA"),
            }
            if is_media and attachments:
                att = attachments[0]
                if att.get("title") or att.get("filename"):
                    audit_pl["filename"] = att.get("title") or att.get("filename")
                if att.get("mime_type"):
                    audit_pl["mime_type"] = att.get("mime_type")
                if att.get("file_size"):
                    audit_pl["size"] = att.get("file_size")

            await AuditService.log_action(
                session=session,
                user_id=sender_user_id,
                action=action_name,
                resource_type="conversation",
                resource_id=str(conv.id),
                payload=audit_pl,
            )
        except Exception as audit_msg_err:
            logger.error("[AuditService] Error recording outbound message audit: %s", audit_msg_err)

        # Moderation & Bad Words Check on Outbound Messages (For ALL roles: Admin, Agent, Supervisor)
        if clean_text:
            try:
                chan_name = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
                sender_display_name = "موظف الدعم"
                sender_role_str = "agent"
                if sender_user_id:
                    from app.models.user import User
                    user_obj = await session.get(User, sender_user_id)
                    if user_obj:
                        if user_obj.full_name:
                            sender_display_name = user_obj.full_name
                        if hasattr(user_obj.role, "value"):
                            sender_role_str = str(user_obj.role.value)
                        elif user_obj.role:
                            sender_role_str = str(user_obj.role)

                from app.services.moderation_service import ModerationService
                matched = ModerationService.scan_for_bad_words(clean_text)
                if matched:
                    await ModerationService.handle_detected_bad_words(
                        session=session,
                        matched_words=matched,
                        message_text=clean_text,
                        sender_type=sender_role_str,
                        sender_name=sender_display_name,
                        sender_id=str(sender_user_id) if sender_user_id else None,
                        conversation_id=conv.id,
                        customer_name=(
                            conv.customer.display_name
                            if (getattr(conv, "customer", None) and conv.customer and conv.customer.display_name)
                            else "عميل"
                        ),
                        brand_name=getattr(conv, "brand", None),
                        channel=chan_name,
                    )
            except Exception as mod_err:
                logger.error("[Moderation Engine] Error checking outbound message: %s", mod_err, exc_info=True)

        # Agent Dynamic Location Override Hook
        updated_loc = None
        location_status = "not_detected"
        if conv.customer_id and clean_text:
            try:
                detected_country = CountryDetector.extract_country(clean_text)
                if detected_country:
                    cust = await session.get(Customer, conv.customer_id)
                    if cust:
                        current_loc = getattr(cust, "location", None)
                        if current_loc != detected_country:
                            cust.location = detected_country
                            session.add(cust)
                            await session.flush()
                            updated_loc = detected_country
                            location_status = "detected"
            except Exception as e:
                logger.error(f"[Location Override Error] Failed to update customer location: {e}")

        await session.commit()
        await session.refresh(new_message)
        if is_automated_reply:
            await MessageService._broadcast_automation_visibility_sync(conv)

        msg_resp = MessageResponse.model_validate(new_message)
        if sender_user_id:
            msg_resp.sender_user_id = sender_user_id
        if resolved_sender_name:
            msg_resp.sender_name = resolved_sender_name
        if updated_loc:
            msg_resp.updated_customer_location = updated_loc

        return AgentReplyResultDTO(
            message=msg_resp,
            sender_user_id=sender_user_id,
            sender_name=resolved_sender_name,
            updated_customer_location=updated_loc,
            location_detection_status=location_status,
        )
