import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.core.config import settings
from app.core.country_detector import CountryDetector
from app.integrations.meta import MetaProvider
from app.integrations.respond_io import RespondIoProvider
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum
from app.models.message import Message

logger = logging.getLogger("MessageService")


class MessageService:
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
    ) -> Message:
        message = Message(
            conversation_id=conversation_id,
            external_message_id=external_message_id,
            sender_type=sender_type,
            sender_external_id=sender_external_id,
            message_type=message_type,
            text=text,
            metadata_=metadata_ or {},
        )
        session.add(message)

        # Update last_message_at on parent conversation & auto-detect location
        stmt = select(Conversation).where(Conversation.id == conversation_id)
        result = await session.execute(stmt)
        conversation = result.scalar_one_or_none()
        if conversation:
            now = datetime.now(timezone.utc)
            conversation.last_message_at = now
            conversation.last_activity_at = now
            if sender_type == SenderTypeEnum.CUSTOMER:
                conversation.last_customer_message_at = now

            if conversation.customer_id:
                cust_stmt = select(Customer).where(Customer.id == conversation.customer_id)
                cust_res = await session.execute(cust_stmt)
                cust = cust_res.scalar_one_or_none()
                if cust:
                    cust.last_activity_at = now
                    if text:
                        from app.services.location_extractor import extract_location_from_text
                        detected_loc = extract_location_from_text(text)
                        if detected_loc:
                            cust.country = detected_loc
                            cust.location = detected_loc
                    session.add(cust)

        await session.commit()
        await session.refresh(message)
        return message

    @staticmethod
    async def list_messages_for_conversation(
        session: AsyncSession, conversation_id: uuid.UUID
    ) -> list[Message]:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
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
        conv_stmt = select(Conversation).where(Conversation.id == conversation_id)
        conv_res = await session.execute(conv_stmt)
        if not conv_res.scalar_one_or_none():
            raise ValueError(f"Conversation {conversation_id} not found.")

        count_stmt = select(func.count(Message.id)).where(
            Message.conversation_id == conversation_id
        )
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = select(Message).where(Message.conversation_id == conversation_id)
        if order.lower() == "desc":
            stmt = stmt.order_by(Message.created_at.desc(), Message.id.desc())
        else:
            stmt = stmt.order_by(Message.created_at.asc(), Message.id.asc())

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
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
    ) -> Message:
        clean_text = (text or "").strip()
        if not clean_text and not attachments:
            raise ValueError("Message text cannot be empty or whitespace only.")
        if len(clean_text) > 2000:
            raise ValueError("Message text exceeds maximum length of 2000 characters.")

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

        # Validate provider & channel and resolve adapter
        if conv.provider == ProviderEnum.META:
            valid_channels = [ChannelEnum.MESSENGER, ChannelEnum.INSTAGRAM, ChannelEnum.WHATSAPP]
            if conv.channel not in valid_channels:
                raise ValueError(
                    f"Outbound messaging not supported for provider '{conv.provider.value}' and channel '{conv.channel.value}'."
                )
            adapter = provider_adapter or MetaProvider()
            default_sender = settings.META_PAGE_ID
        elif conv.provider == ProviderEnum.RESPOND_IO:
            valid_channels = [ChannelEnum.WHATSAPP, ChannelEnum.MESSENGER]
            if conv.channel not in valid_channels:
                raise ValueError(
                    f"Outbound messaging not supported for provider '{conv.provider.value}' and channel '{conv.channel.value}'."
                )
            adapter = provider_adapter or RespondIoProvider()
            default_sender = "respond_io_agent"
        else:
            raise ValueError(
                f"Outbound messaging not supported for provider '{conv.provider.value}'."
            )

        # Resolve CustomerIdentity for provider/channel
        identity_stmt = select(CustomerIdentity).where(
            CustomerIdentity.customer_id == conv.customer_id,
            CustomerIdentity.provider == conv.provider,
            CustomerIdentity.channel == conv.channel,
        )
        identity_res = await session.execute(identity_stmt)
        identity = identity_res.scalar_one_or_none()

        if not identity or not identity.external_user_id:
            raise ValueError(
                f"Customer recipient identity not found for conversation {conversation_id}."
            )

        clean_recipient = identity.external_user_id.strip()
        if clean_recipient.startswith("t_"):
            clean_recipient = clean_recipient[2:]

        # Idempotency Check BEFORE external API dispatch
        if clean_text:
            recent_agent_stmt = (
                select(Message)
                .where(
                    Message.conversation_id == conv.id,
                    Message.sender_type == SenderTypeEnum.AGENT,
                    Message.text == clean_text,
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
                    return recent_agent_msg

        # Send message through adapter (Check binary file attachment upload for Meta)
        has_media = attachments and len(attachments) > 0
        if has_media and hasattr(adapter, "send_outbound_attachment"):
            first_att = attachments[0]
            att_url = first_att.get("url", "")
            att_type = first_att.get("type", "file")
            import os
            filename = os.path.basename(att_url)
            ext_lower = filename.lower()
            if ext_lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
                att_type = "image"
            elif ext_lower.endswith((".webm", ".ogg", ".opus", ".mp3", ".m4a", ".mp4", ".wav")):
                att_type = "audio"

            file_path = os.path.join(settings.UPLOAD_DIR, filename)

            if not os.path.exists(file_path):
                file_path = os.path.join("/app/uploads", filename)
            if not os.path.exists(file_path):
                file_path = os.path.join(os.getcwd(), "uploads", filename)

            if att_type == "audio" and ext_lower.endswith(".webm"):
                transcoded_path = os.path.join(settings.UPLOAD_DIR, f"{os.path.splitext(filename)[0]}.m4a")
                if not os.path.exists(transcoded_path):
                    from scripts.fix_media_attachments import transcode_to_m4a
                    import asyncio
                    await asyncio.to_thread(transcode_to_m4a, file_path, transcoded_path)
                if os.path.exists(transcoded_path):
                    file_path = transcoded_path
                    m4a_filename = os.path.basename(transcoded_path)
                    m4a_url = f"/uploads/{m4a_filename}"
                    first_att["url"] = m4a_url
                    if attachments:
                        attachments[0]["url"] = m4a_url

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
                        tag=tag,
                    )
                except TypeError:
                    outbound_res = await adapter.send_outbound_message(
                        recipient_external_id=clean_recipient,
                        text=clean_text,
                    )
            else:
                outbound_res = await adapter.send_outbound_message(
                    recipient_external_id=clean_recipient,
                    text=clean_text,
                )
        elif conv.channel == ChannelEnum.INSTAGRAM:
            from app.services.meta_instagram_service import MetaInstagramService
            outbound_res = await MetaInstagramService.send_text_message(
                recipient_id=clean_recipient,
                text=clean_text,
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
                        tag=tag,
                    )
                except TypeError:
                    outbound_res = await adapter.send_outbound_message(
                        recipient_external_id=clean_recipient,
                        text=clean_text,
                    )
            else:
                outbound_res = await adapter.send_outbound_message(
                    recipient_external_id=clean_recipient,
                    text=clean_text,
                )

        ext_msg_id = outbound_res.get("external_message_id") if isinstance(outbound_res, dict) else None

        # Idempotency Check
        if ext_msg_id:
            existing_stmt = select(Message).where(
                Message.conversation_id == conv.id,
                Message.external_message_id == ext_msg_id,
            )
            existing_res = await session.execute(existing_stmt)
            existing_msg = existing_res.scalar_one_or_none()
            if existing_msg:
                return existing_msg

        # Determine Message Type
        msg_type = MessageTypeEnum.TEXT
        if attachments and len(attachments) > 0:
            a_type = attachments[0].get("type", "file")
            if a_type == "audio":
                msg_type = MessageTypeEnum.AUDIO
            elif a_type == "image":
                msg_type = MessageTypeEnum.IMAGE
            else:
                msg_type = MessageTypeEnum.FILE

        agent_id = sender_external_id or default_sender
        now_utc = datetime.now(timezone.utc)

        metadata_dict = {
            "recipient_id": identity.external_user_id,
            "provider_response": outbound_res.get("raw", {}) if isinstance(outbound_res, dict) else {},
        }
        if attachments:
            metadata_dict["attachments"] = attachments

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

        # Auto-detect location from outbound text and update customer record
        if clean_text:
            from app.services.location_extractor import extract_location_from_text
            detected_loc = extract_location_from_text(clean_text)
            if detected_loc and conv.customer_id:
                cust_stmt = select(Customer).where(Customer.id == conv.customer_id)
                cust_res = await session.execute(cust_stmt)
                cust_obj = cust_res.scalar_one_or_none()
                if cust_obj:
                    cust_obj.country = detected_loc
                    cust_obj.location = detected_loc
                    session.add(cust_obj)

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
                await CustomerTimelineService.record_event(
                    session=session,
                    customer_id=conv.customer_id,
                    event_type="message.outbound",
                    channel=chan_str,
                    summary=f"رد موظف عبر {chan_str}",
                    details={
                        "text": db_text[:150] if db_text else "مرفق وسائط",
                        "sender_user_id": str(sender_user_id) if sender_user_id else None,
                    },
                )
            except Exception as tl_err:
                logger.error("[Customer 360 Timeline] Error logging outbound message: %s", tl_err)

        # Agent Dynamic Location Override Hook
        updated_loc = None
        if conv.customer_id and clean_text:
            try:
                detected_country = CountryDetector.extract_country(clean_text)
                if detected_country:
                    cust = await session.get(Customer, conv.customer_id)
                    if cust:
                        cust.location = detected_country
                        session.add(cust)
                        await session.flush()
                        updated_loc = detected_country
            except Exception as e:
                logger.error(f"[Location Override Error] Failed to update customer location: {e}")

        await session.commit()
        if updated_loc:
            setattr(new_message, "updated_customer_location", updated_loc)
        elif conv.customer and getattr(conv.customer, "location", None):
            setattr(new_message, "updated_customer_location", conv.customer.location)

        return new_message
