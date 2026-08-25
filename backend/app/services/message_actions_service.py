import os
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_conversation_access
from app.models.conversation import Conversation
from app.models.enums import MessageTypeEnum, SenderTypeEnum, UserRole
from app.models.message import Message
from app.models.user import User
from app.schemas.messaging import MessageResponse
from app.services.audit_service import AuditService

logger = logging.getLogger("MessageActionsService")


class MessageActionsService:
    @staticmethod
    async def edit_message(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        new_text: str,
        user: User,
    ) -> Message:
        """Edit an existing agent text message with RBAC and ownership enforcement."""
        # 1. Fetch message with sender_user relationship
        stmt = (
            select(Message)
            .options(selectinload(Message.sender_user))
            .where(Message.id == message_id, Message.conversation_id == conversation_id)
        )
        res = await session.execute(stmt)
        msg = res.scalar_one_or_none()
        if not msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found in this conversation.",
            )

        # 2. Inbound customer messages cannot be edited
        if msg.sender_type == SenderTypeEnum.CUSTOMER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Customer messages cannot be edited.",
            )

        # 3. Only text messages can be edited
        if msg.message_type != MessageTypeEnum.TEXT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only text messages can be edited.",
            )

        # 4. Check if message is already deleted
        meta = dict(msg.metadata_ or {})
        if meta.get("is_deleted"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deleted messages cannot be edited.",
            )

        # 5. RBAC & Ownership check: Agents can only edit their own messages
        role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
        if role_val == UserRole.AGENT.value:
            if not msg.sender_user_id or msg.sender_user_id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are only authorized to edit your own messages.",
                )

        old_text = msg.text
        now_utc = datetime.now(timezone.utc)

        # 6. Apply Edit
        msg.text = new_text.strip()
        meta["is_edited"] = True
        meta["edited_at"] = now_utc.isoformat()
        meta["edited_by_user_id"] = str(user.id)
        meta["edited_by_name"] = user.full_name
        msg.metadata_ = meta

        await session.commit()
        reload_stmt = select(Message).options(selectinload(Message.sender_user)).where(Message.id == message_id)
        reload_res = await session.execute(reload_stmt)
        msg = reload_res.scalar_one()

        # 7. Audit log
        await AuditService.log_action(
            session=session,
            user_id=user.id,
            action="message.edited",
            resource_type="message",
            resource_id=str(msg.id),
            payload={
                "conversation_id": str(conversation_id),
                "message_id": str(msg.id),
                "changes": {
                    "from": old_text,
                    "to": msg.text,
                },
            },
        )

        # 8. Realtime broadcast
        try:
            from app.api.v1.ws import manager
            resp = MessageResponse.model_validate(msg)
            await manager.broadcast({
                "type": "MESSAGE_UPDATED",
                "conversation_id": str(conversation_id),
                "message": resp.model_dump(mode="json"),
            })
        except Exception as ws_err:
            logger.warning("Error broadcasting MESSAGE_UPDATED: %s", ws_err)

        return msg

    @staticmethod
    async def delete_message(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        user: User,
    ) -> Message:
        """Soft-delete / redact a message with RBAC and ownership checks."""
        stmt = (
            select(Message)
            .options(selectinload(Message.sender_user))
            .where(Message.id == message_id, Message.conversation_id == conversation_id)
        )
        res = await session.execute(stmt)
        msg = res.scalar_one_or_none()
        if not msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found in this conversation.",
            )

        meta = dict(msg.metadata_ or {})
        if meta.get("is_deleted"):
            return msg

        now_utc = datetime.now(timezone.utc)
        original_text = msg.text or ""
        if not original_text and msg.attachments:
            original_text = msg.attachments[0].get("title") or msg.attachments[0].get("url") or "(مرفق وسائط)"

        # Fetch conversation info for rich alert & email
        conv_stmt = (
            select(Conversation)
            .options(selectinload(Conversation.customer))
            .where(Conversation.id == conversation_id)
        )
        conv_res = await session.execute(conv_stmt)
        conv = conv_res.scalar_one_or_none()
        customer_name = (
            conv.customer.display_name
            if (conv and conv.customer and conv.customer.display_name)
            else "عميل"
        )
        brand_name = conv.brand if conv else None
        channel_name = conv.channel.value if conv and hasattr(conv.channel, "value") else (str(conv.channel) if conv else "chat")

        meta["is_deleted"] = True
        meta["deleted_at"] = now_utc.isoformat()
        meta["deleted_by_user_id"] = str(user.id)
        meta["deleted_by_name"] = user.full_name
        meta["original_type"] = msg.message_type.value if hasattr(msg.message_type, "value") else str(msg.message_type)
        meta["attachments"] = []
        meta["media_url"] = None
        msg.metadata_ = meta
        msg.text = None

        # Attempt deleting from Meta Messenger API if external_message_id exists
        if msg.external_message_id:
            try:
                from app.integrations.meta.client import MetaClient
                meta_client = MetaClient()
                await meta_client.delete_message(msg.external_message_id)
                logger.info(f"[Meta Deletion] Dispatched delete request for external message {msg.external_message_id}")
            except Exception as meta_del_err:
                logger.warning(f"[Meta Deletion] Meta Graph API delete attempt: {meta_del_err}")

        await session.commit()
        reload_stmt = select(Message).options(selectinload(Message.sender_user)).where(Message.id == message_id)
        reload_res = await session.execute(reload_stmt)
        msg = reload_res.scalar_one()

        # 1. Audit log (immutably preserves what was deleted)
        await AuditService.log_action(
            session=session,
            user_id=user.id,
            action="message.deleted",
            resource_type="message",
            resource_id=str(msg.id),
            payload={
                "conversation_id": str(conversation_id),
                "message_id": str(msg.id),
                "deleted_text": original_text,
                "deleted_by_name": user.full_name,
                "deleted_by_email": user.email,
                "customer_name": customer_name,
                "brand": brand_name,
                "channel": channel_name,
                "deleted_at": now_utc.isoformat(),
            },
        )

        # 2. Realtime broadcast (Chat update + Red Alert Toast for Admins)
        try:
            from app.api.v1.ws import manager
            resp = MessageResponse.model_validate(msg)
            await manager.broadcast({
                "type": "MESSAGE_DELETED",
                "conversation_id": str(conversation_id),
                "message": resp.model_dump(mode="json"),
            })

            # Broadcast high-priority Red Alert to all logged-in Admins
            alert_id = f"del-{msg.id}"
            await manager.broadcast({
                "type": "ADMIN_SECURITY_ALERT",
                "id": alert_id,
                "alert_type": "message_deleted",
                "severity": "high",
                "title": "🚨 تم حذف رسالة في المحادثة",
                "actor_name": user.full_name,
                "actor_email": user.email,
                "actor_type": "agent",
                "deleted_text": original_text or "(رسالة فارغة أو مرفق)",
                "conversation_id": str(conversation_id),
                "customer_name": customer_name,
                "brand_name": brand_name,
                "channel": channel_name,
                "timestamp": now_utc.isoformat(),
            })
        except Exception as ws_err:
            logger.warning("Error broadcasting MESSAGE_DELETED / ADMIN_SECURITY_ALERT: %s", ws_err)

        # 3. Asynchronous Email Alert to Admin
        try:
            from app.services.email_service import EmailService
            from app.services.moderation_service import ModerationService
            mod_cfg = ModerationService.get_config()
            admin_email = mod_cfg.get("admin_alert_email") or os.getenv("ADMIN_ALERT_EMAIL", "luxiraholding@gmail.com")
            if mod_cfg.get("notify_admin_email", True) and admin_email:
                asyncio.create_task(
                    EmailService.send_message_deletion_alert(
                        admin_email=admin_email,
                        deleted_by_name=user.full_name,
                        deleted_by_email=user.email,
                        deleted_text=original_text,
                        conversation_id=str(conversation_id),
                        customer_name=customer_name,
                        brand_name=brand_name,
                        channel=channel_name,
                        deleted_at=now_utc,
                    )
                )
        except Exception as email_err:
            logger.error("Error dispatching email alert: %s", email_err)

        return msg

    @staticmethod
    async def toggle_reaction(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        emoji: str,
        user: User,
    ) -> Message:
        """Toggle an emoji reaction for the user on a message."""
        stmt = (
            select(Message)
            .options(selectinload(Message.sender_user))
            .where(Message.id == message_id, Message.conversation_id == conversation_id)
        )
        res = await session.execute(stmt)
        msg = res.scalar_one_or_none()
        if not msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found in this conversation.",
            )

        clean_emoji = emoji.strip()
        now_utc = datetime.now(timezone.utc)
        meta = dict(msg.metadata_ or {})
        reactions = list(meta.get("reactions") or [])

        # Check if user already reacted with this emoji
        user_str_id = str(user.id)
        existing_idx = -1
        for idx, r in enumerate(reactions):
            if r.get("user_id") == user_str_id and r.get("emoji") == clean_emoji:
                existing_idx = idx
                break

        action_name = "message.reaction_added"
        if existing_idx >= 0:
            # Remove reaction
            reactions.pop(existing_idx)
            action_name = "message.reaction_removed"
        else:
            # Add reaction
            reactions.append({
                "emoji": clean_emoji,
                "user_id": user_str_id,
                "user_name": user.full_name,
                "created_at": now_utc.isoformat(),
            })

        meta["reactions"] = reactions
        msg.metadata_ = meta

        await session.commit()
        reload_stmt = select(Message).options(selectinload(Message.sender_user)).where(Message.id == message_id)
        reload_res = await session.execute(reload_stmt)
        msg = reload_res.scalar_one()

        # Audit log
        await AuditService.log_action(
            session=session,
            user_id=user.id,
            action=action_name,
            resource_type="message",
            resource_id=str(msg.id),
            payload={
                "conversation_id": str(conversation_id),
                "message_id": str(msg.id),
                "emoji": clean_emoji,
            },
        )

        # Realtime broadcast
        try:
            from app.api.v1.ws import manager
            resp = MessageResponse.model_validate(msg)
            await manager.broadcast({
                "type": "MESSAGE_REACTION_UPDATED",
                "conversation_id": str(conversation_id),
                "message": resp.model_dump(mode="json"),
            })
        except Exception as ws_err:
            logger.warning("Error broadcasting MESSAGE_REACTION_UPDATED: %s", ws_err)

        return msg

    @staticmethod
    async def toggle_pin(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        user: User,
    ) -> Message:
        """Toggle pinned status on a message."""
        stmt = (
            select(Message)
            .options(selectinload(Message.sender_user))
            .where(Message.id == message_id, Message.conversation_id == conversation_id)
        )
        res = await session.execute(stmt)
        msg = res.scalar_one_or_none()
        if not msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Message not found in this conversation.",
            )

        now_utc = datetime.now(timezone.utc)
        meta = dict(msg.metadata_ or {})
        is_currently_pinned = bool(meta.get("is_pinned", False))

        if is_currently_pinned:
            meta["is_pinned"] = False
            meta["pinned_at"] = None
            meta["pinned_by_name"] = None
            action_name = "message.unpinned"
        else:
            meta["is_pinned"] = True
            meta["pinned_at"] = now_utc.isoformat()
            meta["pinned_by_name"] = user.full_name
            action_name = "message.pinned"

        msg.metadata_ = meta

        await session.commit()
        reload_stmt = select(Message).options(selectinload(Message.sender_user)).where(Message.id == message_id)
        reload_res = await session.execute(reload_stmt)
        msg = reload_res.scalar_one()

        # Audit log
        await AuditService.log_action(
            session=session,
            user_id=user.id,
            action=action_name,
            resource_type="message",
            resource_id=str(msg.id),
            payload={
                "conversation_id": str(conversation_id),
                "message_id": str(msg.id),
                "is_pinned": meta["is_pinned"],
            },
        )

        # Realtime broadcast
        try:
            from app.api.v1.ws import manager
            resp = MessageResponse.model_validate(msg)
            await manager.broadcast({
                "type": "MESSAGE_PIN_UPDATED",
                "conversation_id": str(conversation_id),
                "message": resp.model_dump(mode="json"),
            })
        except Exception as ws_err:
            logger.warning("Error broadcasting MESSAGE_PIN_UPDATED: %s", ws_err)

        return msg

    @staticmethod
    async def forward_message(
        session: AsyncSession,
        source_conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        target_conversation_id: uuid.UUID,
        user: User,
    ) -> Message:
        """Forward an existing message to another conversation without duplicating media files."""
        # 1. Fetch original message
        stmt = (
            select(Message)
            .options(selectinload(Message.sender_user))
            .where(Message.id == message_id, Message.conversation_id == source_conversation_id)
        )
        res = await session.execute(stmt)
        orig_msg = res.scalar_one_or_none()
        if not orig_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Source message not found.",
            )

        # 2. Fetch and authorize target conversation
        target_conv_stmt = select(Conversation).where(Conversation.id == target_conversation_id)
        target_conv_res = await session.execute(target_conv_stmt)
        target_conv = target_conv_res.scalar_one_or_none()
        if not target_conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target conversation not found.",
            )

        # Enforce conversation authorization on target conversation (brand + channel)
        require_conversation_access(target_conv, user)

        # 3. Extract media / text from original message
        orig_meta = dict(orig_msg.metadata_ or {})
        attachments = orig_meta.get("attachments")
        if not attachments and orig_msg.media_url:
            attachments = [{
                "url": orig_msg.media_url,
                "type": "image" if "image" in str(orig_msg.message_type) else "file",
                "filename": "forwarded_attachment",
            }]

        from app.services.message_service import MessageService
        forwarded_msg = await MessageService.send_agent_reply(
            session=session,
            conversation_id=target_conversation_id,
            text=orig_msg.text,
            attachments=attachments,
            sender_user_id=user.id,
            forwarded_from={
                "original_message_id": str(orig_msg.id),
                "original_conversation_id": str(source_conversation_id),
            },
        )

        # 4. Audit log
        await AuditService.log_action(
            session=session,
            user_id=user.id,
            action="message.forwarded",
            resource_type="message",
            resource_id=str(forwarded_msg.id),
            payload={
                "source_conversation_id": str(source_conversation_id),
                "target_conversation_id": str(target_conversation_id),
                "original_message_id": str(orig_msg.id),
                "new_message_id": str(forwarded_msg.id),
            },
        )

        # 5. Broadcast to target conversation
        try:
            from app.api.v1.ws import manager
            resp = MessageResponse.model_validate(forwarded_msg)
            await manager.broadcast({
                "type": "NEW_MESSAGE",
                "conversation_id": str(target_conversation_id),
                "message": resp.model_dump(mode="json"),
            })
        except Exception as ws_err:
            logger.warning("Error broadcasting forwarded NEW_MESSAGE: %s", ws_err)

        return forwarded_msg
