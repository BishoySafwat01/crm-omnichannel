import logging
import os
import uuid
from datetime import datetime
from typing import Any, Optional
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.integrations.meta import MetaAPIError, MetaNormalizer, MetaProvider
from app.models import (
    ChannelEnum,
    Conversation,
    Message,
    MigrationJob,
    MigrationStatusEnum,
    ProviderEnum,
)
from app.services.conversation_service import ConversationService
from app.services.customer_service import CustomerService
from app.services.message_service import MessageService
from app.services.migration_service import MigrationService

logger = logging.getLogger("app.services.meta_import_service")


class MetaImportService:
    @staticmethod
    def _sanitize_error(err_str: str) -> str:
        token = settings.META_PAGE_ACCESS_TOKEN
        if token and len(token) > 0:
            err_str = err_str.replace(token, "[REDACTED_TOKEN]")
        secret = settings.META_APP_SECRET
        if secret and len(secret) > 0:
            err_str = err_str.replace(secret, "[REDACTED_SECRET]")
        verify_token = settings.META_WEBHOOK_VERIFY_TOKEN
        if verify_token and len(verify_token) > 0:
            err_str = err_str.replace(verify_token, "[REDACTED_VERIFY_TOKEN]")
        return err_str

    @staticmethod
    async def fetch_and_cache_customer_profile(psid: str) -> dict[str, Any]:
        if not psid or not str(psid).strip() or psid == "unknown_customer":
            return {}

        avatars_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
        os.makedirs(avatars_dir, exist_ok=True)

        url = f"https://graph.facebook.com/v23.0/{psid}?fields=first_name,last_name,profile_pic,locale&access_token={settings.META_PAGE_ACCESS_TOKEN}"
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    pic_url = data.get("profile_pic")
                    local_avatar_url = None
                    if pic_url:
                        pic_res = await client.get(
                            pic_url,
                            headers={"Authorization": f"Bearer {settings.META_PAGE_ACCESS_TOKEN}"},
                        )
                        if pic_res.status_code == 200 and len(pic_res.content) > 500:
                            dest_file = f"avatar_{psid}.jpg"
                            dest_path = os.path.join(avatars_dir, dest_file)
                            with open(dest_path, "wb") as f:
                                f.write(pic_res.content)
                            local_avatar_url = f"/uploads/avatars/{dest_file}"

                    return {
                        "first_name": data.get("first_name", ""),
                        "last_name": data.get("last_name", ""),
                        "profile_pic": local_avatar_url or pic_url,
                        "locale": data.get("locale"),
                    }
        except Exception as e:
            logger.warning("Failed to fetch/cache avatar for PSID %s: %s", psid, e)
        return {}

    @staticmethod
    async def run_import(
        session: AsyncSession,
        page_id: Optional[str] = None,
        channel: ChannelEnum = ChannelEnum.MESSENGER,
        provider_adapter: Optional[MetaProvider] = None,
    ) -> MigrationJob:
        adapter = provider_adapter or MetaProvider()

        # 1. Validate configuration & page access
        try:
            page_info = await adapter.validate_configuration()
        except MetaAPIError as exc:
            job = await MigrationService.create_migration_job(
                session=session,
                provider=ProviderEnum.META,
                channel=channel,
            )
            await MigrationService.update_migration_status(
                session=session,
                job_id=job.id,
                status=MigrationStatusEnum.FAILED,
                error_entry={
                    "stage": "validation",
                    "error": MetaImportService._sanitize_error(str(exc.message)),
                    "status_code": exc.status_code,
                },
            )
            return job

        target_page_id = page_info.get("page_id") or page_id

        # 2. Create MigrationJob
        job = await MigrationService.create_migration_job(
            session=session,
            provider=ProviderEnum.META,
            channel=channel,
        )
        await MigrationService.update_migration_status(
            session=session, job_id=job.id, status=MigrationStatusEnum.RUNNING
        )

        has_errors = False

        # 3. Fetch all conversations from Meta Graph API
        try:
            norm_conversations = await adapter.get_all_conversations(
                page_id=target_page_id, channel=channel
            )
            job.total_conversations = len(norm_conversations)
            await session.commit()
        except Exception as exc:
            has_errors = True
            await MigrationService.update_migration_status(
                session=session,
                job_id=job.id,
                status=MigrationStatusEnum.FAILED,
                error_entry={
                    "stage": "fetch_conversations",
                    "error": MetaImportService._sanitize_error(str(exc)),
                },
            )
            return job

        # 4. Import each conversation and its messages
        for norm_conv in norm_conversations:
            try:
                # Resolve Customer & CustomerIdentity
                cust_ext_id = norm_conv.customer_external_user_id or "unknown_customer"
                profile_info = {}
                if cust_ext_id and cust_ext_id != "unknown_customer":
                    try:
                        profile_info = await MetaImportService.fetch_and_cache_customer_profile(cust_ext_id)
                    except Exception:
                        profile_info = {}

                resolved_name = (
                    f"{profile_info.get('first_name', '')} {profile_info.get('last_name', '')}".strip()
                    or norm_conv.customer_display_name
                )

                customer, _ = await CustomerService.get_or_create_customer_with_identity(
                    session=session,
                    provider=ProviderEnum.META,
                    channel=channel,
                    external_user_id=cust_ext_id,
                    display_name=resolved_name,
                )

                # Enrich Customer profile details
                if profile_info.get("profile_pic"):
                    customer.avatar_url = profile_info["profile_pic"]
                if profile_info.get("locale"):
                    customer.locale = profile_info["locale"]
                if resolved_name:
                    customer.display_name = resolved_name
                await session.flush()

                # Upsert Conversation idempotently
                existing_conv = await ConversationService.get_conversation_by_external_id(
                    session=session,
                    provider=ProviderEnum.META,
                    channel=channel,
                    external_conversation_id=norm_conv.external_conversation_id,
                )

                if existing_conv:
                    conv = existing_conv
                    conv.last_message_at = norm_conv.last_message_at
                    await session.commit()
                else:
                    conv = await ConversationService.create_conversation(
                        session=session,
                        customer_id=customer.id,
                        provider=ProviderEnum.META,
                        channel=channel,
                        external_conversation_id=norm_conv.external_conversation_id,
                        subject=norm_conv.subject,
                        status=norm_conv.status,
                    )

                # Fetch Messages for this conversation
                norm_messages = await adapter.get_all_messages(
                    conversation_id=norm_conv.external_conversation_id
                )
                job.total_messages += len(norm_messages)
                await session.commit()

                # Upsert Messages idempotently
                for norm_msg in norm_messages:
                    stmt = select(Message).where(
                        Message.conversation_id == conv.id,
                        Message.external_message_id == norm_msg.external_message_id,
                    )
                    res = await session.execute(stmt)
                    existing_msg = res.scalar_one_or_none()

                    if not existing_msg:
                        msg = Message(
                            conversation_id=conv.id,
                            external_message_id=norm_msg.external_message_id,
                            sender_type=norm_msg.sender_type,
                            sender_external_id=norm_msg.sender_external_id,
                            message_type=norm_msg.message_type,
                            text=norm_msg.text,
                            created_at=norm_msg.created_at,
                            metadata_=norm_msg.metadata_,
                        )
                        session.add(msg)
                        await session.commit()

                    job.processed_messages += 1

                job.processed_conversations += 1
                await session.commit()

            except Exception as exc:
                has_errors = True
                job.failed_items += 1
                current_logs = list(job.error_log or [])
                current_logs.append(
                    {
                        "conversation_id": norm_conv.external_conversation_id,
                        "error": MetaImportService._sanitize_error(str(exc)),
                    }
                )
                job.error_log = current_logs
                await session.commit()

        # 5. Finalize MigrationJob Status
        if not has_errors:
            final_status = MigrationStatusEnum.COMPLETED
        elif job.processed_conversations > 0:
            final_status = MigrationStatusEnum.COMPLETED_WITH_ERRORS
        else:
            final_status = MigrationStatusEnum.FAILED

        await MigrationService.update_migration_status(
            session=session, job_id=job.id, status=final_status
        )

        return job

    @staticmethod
    async def download_and_cache_media(url: str, media_type: str = "file") -> str:
        if not url or not isinstance(url, str) or not url.startswith("http"):
            return url
        try:
            url_lower = url.lower()
            prefix = "media_"
            ext = ".bin"
            if media_type == "video" or "video" in media_type:
                ext = ".mp4"
                prefix = "vid_"
            elif media_type == "image" or "image" in media_type:
                ext = ".jpg"
                prefix = "img_"
            elif media_type == "audio" or "audio" in media_type:
                ext = ".m4a"
                prefix = "voice_"
            elif ".jpg" in url_lower or ".jpeg" in url_lower:
                ext = ".jpg"
                prefix = "img_"
            elif ".png" in url_lower:
                ext = ".png"
                prefix = "img_"
            elif ".webp" in url_lower:
                ext = ".webp"
                prefix = "img_"
            elif ".gif" in url_lower:
                ext = ".gif"
                prefix = "img_"
            elif ".mp3" in url_lower or ".ogg" in url_lower or ".m4a" in url_lower:
                ext = ".m4a"
                prefix = "voice_"
            elif ".mp4" in url_lower:
                ext = ".mp4"
                prefix = "vid_"
            elif ".pdf" in url_lower:
                ext = ".pdf"
                prefix = "doc_"
            elif "image-" in url_lower or "img-" in url_lower:
                ext = ".jpg"
                prefix = "img_"

            filename = f"{prefix}{uuid.uuid4().hex[:12]}{ext}"
            uploads_dir = settings.UPLOAD_DIR
            os.makedirs(uploads_dir, exist_ok=True)

            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                headers = {}
                if "facebook.com" in url or "fbcdn.net" in url or "fbsbx.com" in url:
                    if settings.META_PAGE_ACCESS_TOKEN:
                        headers["Authorization"] = f"Bearer {settings.META_PAGE_ACCESS_TOKEN}"

                resp = await client.get(url, headers=headers)
                if resp.status_code == 200 and len(resp.content) > 200:
                    if not resp.content.startswith(b"<!DOCTYPE") and not resp.content.startswith(b"{\"error\""):
                        content_start = resp.content[:16]
                        if content_start.startswith(b"\xff\xd8\xff"):
                            filename = f"{os.path.splitext(filename)[0]}.jpg"
                        elif content_start.startswith(b"\x89PNG\r\n\x1a\n"):
                            filename = f"{os.path.splitext(filename)[0]}.png"
                        elif content_start.startswith(b"RIFF") and b"WEBP" in content_start:
                            filename = f"{os.path.splitext(filename)[0]}.webp"
                        elif content_start.startswith(b"OggS"):
                            filename = f"{os.path.splitext(filename)[0]}.ogg"
                        elif b"ftyp" in content_start:
                            if "audio" in media_type:
                                filename = f"{os.path.splitext(filename)[0]}.m4a"
                            else:
                                filename = f"{os.path.splitext(filename)[0]}.mp4"

                        upload_path = os.path.join(uploads_dir, filename)
                        with open(upload_path, "wb") as f:
                            f.write(resp.content)
                        return f"/uploads/{filename}"
                    else:
                        logger.error("Meta CDN returned error page instead of media binary: %s", resp.text[:200])
                else:
                    logger.warning("Meta CDN fetch returned HTTP %s for url: %s", resp.status_code, url)
        except Exception as e:
            logger.warning("Failed to cache inbound media attachment: %s", str(e))
        return url

    @staticmethod
    async def process_inbound_webhook(
        session: AsyncSession,
        raw_payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not isinstance(raw_payload, dict):
            logger.error("Meta webhook error: raw payload is not a dict")
            raise ValueError("Invalid Meta webhook payload structure.")

        obj_type = raw_payload.get("object")
        if obj_type != "page":
            logger.error("Meta webhook error: object '%s' != 'page'", obj_type)
            raise ValueError(f"Unsupported Meta webhook object type: '{obj_type}'. Expected 'page'.")

        entries = raw_payload.get("entry", [])
        if not isinstance(entries, list) or len(entries) == 0:
            logger.warning("Meta webhook: received empty entry list")
            return {"status": "processed", "message": "Ignored empty Meta webhook entry list."}

        expected_page_id = settings.META_PAGE_ID
        total_processed = 0
        created_count = 0
        last_result_msg_id = None
        last_result_status = "processed"

        for entry in entries:
            entry_page_id = str(entry.get("id", ""))
            # Ignore events for other pages if configured
            if expected_page_id and expected_page_id.strip() and entry_page_id != expected_page_id.strip():
                logger.warning("Meta webhook: ignoring entry for page_id=%s (expected=%s)", entry_page_id, expected_page_id)
                continue

            messaging_list = entry.get("messaging", [])
            if not isinstance(messaging_list, list):
                continue

            for item in messaging_list:
                msg_data = item.get("message", {}) if isinstance(item, dict) else {}
                if isinstance(msg_data, dict) and (msg_data.get("is_echo") is True or item.get("is_echo") is True):
                    logger.info("Meta webhook: ignoring echo message from page for mid=%s", msg_data.get("mid"))
                    continue

                norm_event = MetaNormalizer.normalize_webhook_event(item, page_id=entry_page_id)
                total_processed += 1

                logger.info(
                    "Meta webhook event parsed: message_id=%s, sender_psid=%s, page_id=%s",
                    norm_event.external_message_id,
                    norm_event.sender_psid,
                    norm_event.page_id,
                )

                if not norm_event.sender_psid or not norm_event.sender_psid.strip():
                    logger.error("Meta webhook error: missing sender PSID")
                    raise ValueError("Missing sender PSID in Meta webhook event.")

                if not norm_event.external_message_id:
                    logger.info("Meta webhook: non-message event ignored for sender_psid=%s", norm_event.sender_psid)
                    continue

                # 1. Resolve/create Customer & CustomerIdentity
                customer, identity = await CustomerService.get_or_create_customer_with_identity(
                    session=session,
                    provider=ProviderEnum.META,
                    channel=ChannelEnum.MESSENGER,
                    external_user_id=norm_event.sender_psid,
                )

                # 2. Resolve/create Conversation
                conv = await ConversationService.get_or_create_conversation_for_identity(
                    session=session,
                    identity=identity,
                )

                # 3. Idempotency Check
                stmt = select(Message).where(
                    Message.conversation_id == conv.id,
                    Message.external_message_id == norm_event.external_message_id,
                )
                res = await session.execute(stmt)
                existing_msg = res.scalar_one_or_none()

                if existing_msg:
                    logger.info("Meta webhook idempotency: duplicate message_id=%s skipped", norm_event.external_message_id)
                    last_result_status = "already_processed"
                    last_result_msg_id = str(existing_msg.id)
                    continue

                # 4. Insert Message
                cached_attachments = []
                if norm_event.attachments:
                    for att in norm_event.attachments:
                        if isinstance(att, dict) and "url" in att:
                            c_url = await MetaImportService.download_and_cache_media(att["url"])
                            cached_attachments.append({**att, "url": c_url})
                        else:
                            cached_attachments.append(att)

                msg = Message(
                    conversation_id=conv.id,
                    external_message_id=norm_event.external_message_id,
                    sender_type=norm_event.sender_type,
                    sender_external_id=norm_event.sender_psid,
                    message_type=norm_event.message_type,
                    text=norm_event.text,
                    created_at=norm_event.created_at,
                    metadata_={
                        "attachments": cached_attachments if cached_attachments else norm_event.attachments,
                        "raw": item,
                    },
                )
                session.add(msg)

                # 5. Update last_message_at safely
                if conv.last_message_at is None or norm_event.created_at > conv.last_message_at:
                    conv.last_message_at = norm_event.created_at

                await session.commit()
                await session.refresh(msg)
                created_count += 1
                last_result_status = "success"
                last_result_msg_id = str(msg.id)

                # Broadcast real-time WebSocket event to connected UI clients
                try:
                    from app.api.v1.ws import manager
                    atts = cached_attachments if cached_attachments else norm_event.attachments
                    await manager.broadcast({
                        "type": "NEW_MESSAGE",
                        "conversation_id": str(conv.id),
                        "message": {
                            "id": str(msg.id),
                            "conversation_id": str(conv.id),
                            "external_message_id": msg.external_message_id,
                            "sender_type": msg.sender_type.value if hasattr(msg.sender_type, "value") else str(msg.sender_type),
                            "sender_external_id": msg.sender_external_id,
                            "message_type": msg.message_type.value if hasattr(msg.message_type, "value") else str(msg.message_type),
                            "text": msg.text,
                            "created_at": msg.created_at.isoformat(),
                            "delivery_status": "delivered",
                            "attachments": atts,
                        }
                    })
                except Exception as ws_err:
                    logger.warning("Failed to broadcast inbound message over WebSocket: %s", str(ws_err))

                logger.info("Meta webhook success: message_id=%s persisted (id=%s)", norm_event.external_message_id, msg.id)

        return {
            "status": last_result_status,
            "processed_events": total_processed,
            "messages_created": created_count,
            "last_message_id": last_result_msg_id,
        }
