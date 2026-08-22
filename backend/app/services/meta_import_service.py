import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

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

        job_id = job.id
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
                await session.rollback()
                job = await session.get(MigrationJob, job_id)
                if job:
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
    async def resolve_whatsapp_media(media_id: str, mime_type: str = "image/jpeg") -> Optional[str]:
        """Fetch temporary CDN URL via Meta Graph API, download, transcode if audio, and return local URL."""
        if not settings.META_PAGE_ACCESS_TOKEN or not media_id:
            return None

        uploads_dir = settings.UPLOAD_DIR
        os.makedirs(uploads_dir, exist_ok=True)

        meta_url = f"https://graph.facebook.com/{settings.META_GRAPH_API_VERSION}/{media_id}"
        headers = {"Authorization": f"Bearer {settings.META_PAGE_ACCESS_TOKEN}"}

        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                res = await client.get(meta_url, headers=headers)
                if res.status_code != 200:
                    return None
                download_url = res.json().get("url")
                if not download_url:
                    return None

                media_res = await client.get(download_url, headers=headers)
                if media_res.status_code != 200:
                    return None

                is_audio = "audio" in mime_type or "ogg" in mime_type or "opus" in mime_type
                ext = ".m4a" if is_audio else (".jpg" if "image" in mime_type else ".bin")
                filename = f"wa_{media_id[:12]}{ext}"
                disk_path = os.path.join(uploads_dir, filename)

                with open(disk_path, "wb") as f:
                    f.write(media_res.content)

                if is_audio:
                    from scripts.fix_media_attachments import transcode_to_m4a
                    transcoded_path = os.path.join(uploads_dir, f"voice_{media_id[:12]}.m4a")
                    if transcode_to_m4a(disk_path, transcoded_path):
                        return f"/uploads/{os.path.basename(transcoded_path)}"

                return f"/uploads/{filename}"
        except Exception as e:
            logger.error("[WhatsApp Media] Failed to resolve media_id %s: %s", media_id, e)
            return None

    @staticmethod
    async def process_inbound_webhook(
        session: AsyncSession, raw_payload: dict[str, Any]
    ) -> dict[str, Any]:
        if not isinstance(raw_payload, dict):
            logger.error("Meta webhook error: raw payload is not a dict")
            raise ValueError("Invalid Meta webhook payload structure.")

        obj_type = raw_payload.get("object")
        valid_objects = ["page", "instagram", "whatsapp_business_account"]
        if obj_type not in valid_objects:
            logger.error("Meta webhook error: object '%s' not in valid objects %s", obj_type, valid_objects)

        entries = raw_payload.get("entry", [])
        if not isinstance(entries, list) or len(entries) == 0:
            logger.warning("Meta webhook: received empty entry list")
            return {"status": "processed", "message": "Ignored empty Meta webhook entry list."}

        valid_page_ids = {
            p.strip() for p in [
                settings.META_PAGE_ID,
                settings.WHATSAPP_WABA_ID,
                settings.WHATSAPP_PHONE_NUMBER_ID,
                settings.INSTAGRAM_ACCOUNT_ID,
            ] if p and p.strip()
        }
        total_processed = 0
        created_count = 0
        last_result_msg_id = None
        last_result_status = "processed"

        for entry in entries:
            entry_page_id = str(entry.get("id", ""))
            if valid_page_ids and entry_page_id and entry_page_id.strip() not in valid_page_ids:
                logger.warning("Meta webhook: ignoring entry for ID '%s' (valid IDs: %s)", entry_page_id, valid_page_ids)
                continue

            # Extract list of items (either entry.messaging, entry.standby, or entry.changes)
            items = []
            channel_hint = ChannelEnum.MESSENGER
            if obj_type == "instagram" or "instagram" in str(entry):
                channel_hint = ChannelEnum.INSTAGRAM


            if "messaging" in entry and isinstance(entry["messaging"], list):
                items.extend(entry["messaging"])
            if "standby" in entry and isinstance(entry["standby"], list):
                items.extend(entry["standby"])
            if "changes" in entry and isinstance(entry["changes"], list):
                channel_hint = ChannelEnum.WHATSAPP
                items.extend(entry["changes"])

            for item in items:
                # 0. Check if item is a feed/comment event
                if isinstance(item, dict) and (item.get("field") in ["feed", "comments"] or item.get("value", {}).get("item") == "comment"):
                    await MetaImportService.handle_comment_webhook(session, item)
                    total_processed += 1
                    continue

                msg_data = item.get("message", {}) if isinstance(item, dict) else {}
                is_echo = bool(msg_data.get("is_echo") or item.get("is_echo"))
                echo_mid = msg_data.get("mid")
                echo_text = msg_data.get("text")

                norm_event = MetaNormalizer.normalize_webhook_event(item, page_id=entry_page_id, channel_hint=channel_hint)
                total_processed += 1

                logger.info(
                    "Meta webhook event parsed: message_id=%s, sender_psid=%s, channel=%s, is_echo=%s",
                    norm_event.external_message_id,
                    norm_event.sender_psid,
                    norm_event.channel,
                    is_echo,
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
                    channel=norm_event.channel,
                    external_user_id=norm_event.sender_psid,
                )

                if norm_event.sender_name and (not customer.display_name or customer.display_name == "عميل"):
                    customer.display_name = norm_event.sender_name
                    session.add(customer)

                if not customer.avatar_url or customer.display_name == "عميل":
                    # Fire profile enrichment asynchronously in the background to keep webhook response <500ms
                    asyncio.create_task(
                        MetaImportService.enrich_customer_profile_background(
                            customer_id=customer.id,
                            sender_psid=norm_event.sender_psid,
                        )
                    )

                # 2. Resolve/create Conversation
                conv = await ConversationService.get_or_create_conversation_for_identity(
                    session=session,
                    identity=identity,
                )

                if norm_event.metadata_ and norm_event.metadata_.get("referral"):
                    logger.info("Referral attribution detected: %s", norm_event.metadata_["referral"])

                # Echo handling & Deduplication
                if is_echo:
                    logger.info(f"[Webhook Echo] Received echo event for mid: {echo_mid} in Conv: {conv.id}")
                    
                    # 1. Check if message already exists with this external_message_id
                    existing_by_mid = (await session.execute(
                        select(Message).where(Message.external_message_id == echo_mid)
                    )).scalar_one_or_none()
                    
                    if existing_by_mid:
                        await session.commit()
                        logger.info(f"✅ [Echo Handled] Message already exists for mid: {echo_mid}")
                        last_result_status = "already_processed"
                        last_result_msg_id = str(existing_by_mid.id)
                        continue

                    # 2. Check if an agent message was recently created in this conversation with identical text
                    recent_agent_msg = (await session.execute(
                        select(Message)
                        .where(
                            Message.conversation_id == conv.id,
                            Message.sender_type == SenderTypeEnum.AGENT,
                            Message.text == echo_text
                        )
                        .order_by(Message.created_at.desc())
                        .limit(1)
                    )).scalar_one_or_none()

                    if recent_agent_msg:
                        recent_agent_msg.external_message_id = echo_mid
                        await session.commit()
                        logger.info(f"✅ [Echo Deduplicated] Linked Meta MID {echo_mid} to existing message {recent_agent_msg.id}")
                        last_result_status = "already_processed"
                        last_result_msg_id = str(recent_agent_msg.id)
                        continue

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
                attachments_list = norm_event.attachments


                if attachments_list and len(attachments_list) > 1:
                    for idx, att in enumerate(attachments_list):
                        att_mid = f"{norm_event.external_message_id}_att_{idx}" if idx > 0 else norm_event.external_message_id

                        existing_att = (await session.execute(
                            select(Message).where(Message.external_message_id == att_mid)
                        )).scalar_one_or_none()

                        if existing_att:
                            continue

                        att_type = att.get("type", norm_event.message_type) if isinstance(att, dict) else norm_event.message_type
                        if isinstance(att, dict) and (att.get("image_data") or (att.get("mime_type") or "").startswith("image/")):
                            att_type = "image"
                        att_url = (
                            att.get("url")
                            or att.get("payload", {}).get("url")
                            or att.get("image_data", {}).get("url")
                            or att.get("image_data", {}).get("preview_url")
                        ) if isinstance(att, dict) else None

                        msg = Message(
                            conversation_id=conv.id,
                            external_message_id=att_mid,
                            sender_type=norm_event.sender_type,
                            sender_external_id=norm_event.sender_psid,
                            message_type=att_type,
                            text=norm_event.text if idx == 0 else None,
                            created_at=norm_event.created_at,
                            metadata_={
                                "attachments": [att],
                                "media_url": att_url,
                                "referral": norm_event.metadata_.get("referral"),
                                "raw": item,
                            },
                        )
                        session.add(msg)
                        await session.commit()
                        await session.refresh(msg)
                        created_count += 1
                        last_result_status = "success"
                        last_result_msg_id = str(msg.id)

                        try:
                            from app.api.v1.ws import manager
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
                                    "media_url": att_url,
                                    "created_at": msg.created_at.isoformat(),
                                    "delivery_status": "delivered",
                                    "attachments": [att],
                                }
                            })
                        except Exception as ws_err:
                            logger.warning("Failed to broadcast multi-attachment WS: %s", str(ws_err))
                        logger.info(f"[Webhook Multi-Media] Saved attachment {idx+1}/{len(attachments_list)} (ID: {att_mid}) for Conv {conv.id}")
                else:
                    first_att = attachments_list[0] if attachments_list and isinstance(attachments_list[0], dict) else {}
                    single_att_url = (
                        first_att.get("url")
                        or first_att.get("payload", {}).get("url")
                        or first_att.get("image_data", {}).get("url")
                        or first_att.get("image_data", {}).get("preview_url")
                    ) if first_att else None

                    single_msg_type = norm_event.message_type
                    if first_att and (first_att.get("image_data") or (first_att.get("mime_type") or "").startswith("image/")):
                        single_msg_type = "image"

                    msg = Message(
                        conversation_id=conv.id,
                        external_message_id=norm_event.external_message_id,
                        sender_type=norm_event.sender_type,
                        sender_external_id=norm_event.sender_psid,
                        message_type=single_msg_type,
                        text=norm_event.text,
                        created_at=norm_event.created_at,
                        metadata_={
                            "attachments": attachments_list,
                            "media_url": single_att_url,
                            "referral": norm_event.metadata_.get("referral"),
                            "raw": item,
                        },
                    )
                    session.add(msg)
                    await session.commit()
                    await session.refresh(msg)
                    created_count += 1
                    last_result_status = "success"
                    last_result_msg_id = str(msg.id)

                    try:
                        from app.api.v1.ws import manager
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
                                "attachments": attachments_list,
                            }
                        })
                    except Exception as ws_err:
                        logger.warning("Failed to broadcast inbound message over WebSocket: %s", str(ws_err))
                    logger.info("Meta webhook success: message_id=%s persisted (id=%s)", norm_event.external_message_id, msg.id)

                if conv.last_message_at is None or norm_event.created_at > conv.last_message_at:
                    conv.last_message_at = norm_event.created_at

                sender_type_str = norm_event.sender_type.value if hasattr(norm_event.sender_type, "value") else str(norm_event.sender_type)
                if not is_echo and sender_type_str == "customer":
                    conv.unread_count = (getattr(conv, "unread_count", 0) or 0) + 1
                    conv.updated_at = datetime.now(timezone.utc)
                    # Update last_customer_message_at so the 24h Meta messaging window is tracked correctly
                    if conv.last_customer_message_at is None or norm_event.created_at > conv.last_customer_message_at:
                        conv.last_customer_message_at = norm_event.created_at

                await session.commit()

                # Trigger SLA Initialization, Smart Routing & Custom Automation Engine safely for inbound customer messages
                if not is_echo and sender_type_str == "customer":
                    try:
                        from app.services.customer_timeline_service import CustomerTimelineService
                        chan_str = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
                        await CustomerTimelineService.record_event(
                            session=session,
                            customer_id=customer.id,
                            event_type="message.inbound",
                            channel=chan_str,
                            summary=f"رسالة واردة عبر {chan_str}",
                            details={
                                "text": norm_event.text[:150] if norm_event.text else "مرفق وسائط",
                                "message_id": str(msg.id),
                            },
                        )
                    except Exception as tl_err:
                        logger.error("[Customer 360 Timeline] Error logging inbound message: %s", tl_err)

                    try:
                        from app.services.sla_service import SlaService
                        from app.services.routing_service import RoutingService

                        SlaService.start_or_update_sla(conv, norm_event.created_at or datetime.now(timezone.utc))
                        await RoutingService.assign_conversation_smart(session, conv)
                    except Exception as sla_route_err:
                        logger.error(f"[SLA & Routing] Error processing inbound customer message: {sla_route_err}", exc_info=True)

                    try:
                        from app.services.automation_service import AutomationService
                        await AutomationService.evaluate_inbound_message(
                            session=session,
                            conversation=conv,
                            customer=customer,
                            text=norm_event.text,
                        )
                    except Exception as auto_err:
                        logger.error(f"[Automation Engine] Error evaluating inbound message: {auto_err}", exc_info=True)



        return {
            "status": last_result_status,
            "processed_events": total_processed,
            "messages_created": created_count,
            "last_message_id": last_result_msg_id,
        }

    @staticmethod
    async def handle_comment_webhook(session: AsyncSession, item: dict[str, Any]) -> Optional[Any]:
        """Process inbound Meta feed/comment webhook changes, save SocialComment, and run auto-moderation."""
        from app.models.comment import SocialComment
        field = item.get("field")
        value = item.get("value", {})
        if field not in ["feed", "comments"] and value.get("item") != "comment":
            return None

        comment_id = str(value.get("comment_id") or value.get("id") or "")
        post_id = str(value.get("post_id") or value.get("media", {}).get("id") or "post_unknown")
        text = str(value.get("message") or value.get("text") or "")
        sender_name = value.get("from", {}).get("name") or value.get("from", {}).get("username") or "مستخدم زائر"
        sender_id = str(value.get("from", {}).get("id") or "user_anon")

        if not comment_id or not text.strip():
            return None

        stmt = select(SocialComment).where(SocialComment.comment_id == comment_id)
        res = await session.execute(stmt)
        comment = res.scalar_one_or_none()

        # 1. Hydrate post metadata if missing
        post_url = str(value.get("permalink_url") or value.get("post_url") or f"https://facebook.com/{post_id}")
        post_thumbnail = str(value.get("full_picture") or value.get("media", {}).get("media_url") or "")
        post_title_val = str(value.get("post_title") or value.get("message") or "منشور LUXIRA الرسمي")

        clean_txt = text.lower()
        is_toxic = any(word in clean_txt for word in ["شتيمة", "احتيال", "نصب", "سيء جداً", "scam", "spam", "bad service", "fake"])
        sentiment = "toxic" if is_toxic else ("negative" if any(w in clean_txt for w in ["مشكلة", "تأخير", "خراب"]) else "neutral")

        from app.integrations.meta.client import MetaClient
        client = MetaClient()

        if not comment:
            comment = SocialComment(
                post_id=post_id,
                post_title=post_title_val[:250],
                post_url=post_url,
                post_thumbnail=post_thumbnail,
                comment_id=comment_id,
                author_name=sender_name,
                author_id=sender_id,
                text=text,
                channel="facebook" if field == "feed" else "instagram",
                brand="LUXIRA",
                sentiment=sentiment,
                is_hidden=is_toxic,
            )
            session.add(comment)
        else:
            comment.text = text
            comment.sentiment = sentiment
            if post_url:
                comment.post_url = post_url
            if post_thumbnail:
                comment.post_thumbnail = post_thumbnail
            if is_toxic:
                comment.is_hidden = True

        await session.commit()
        await session.refresh(comment)

        # 2. Automated Actions Pipeline (Toxicity Protection & Auto-Response)
        if is_toxic:
            try:
                await client.hide_comment(comment_id, is_hidden=True)
                logger.info("Auto-moderation: Hidden toxic comment %s", comment_id)
            except Exception as err:
                logger.warning("Failed to auto-hide toxic comment %s via Meta API: %s", comment_id, err)
        elif not comment.auto_replied:
            # Bidirectional Comment Auto-Response Engine
            is_price_query = any(w in clean_txt for w in ["سعر", "بكام", "بكم", "تفاصيل", "كم", "شحن", "رياض", "follow", "سعر الفستان"])
            if is_price_query:
                pub_reply = "أهلاً بك! تم إرسال جميع التفاصيل والسعر في رسالة خاصة (DM)."
                try:
                    await client.reply_to_comment(comment_id, pub_reply)
                except Exception as ex_pub:
                    logger.debug("Public auto-reply fallback for %s: %s", comment_id, ex_pub)

                try:
                    dm_res = await client.send_private_reply(comment_id, "مرحباً بك من LUXIRA! متاح التوصيل الفوري مع خصم 15%. سعر التشكيلة الحريرية 450 ريال.")
                    comment.dm_thread_id = str(dm_res.get("id") or f"dm_{comment_id}")
                except Exception as ex_dm:
                    logger.debug("Private DM auto-reply fallback for %s: %s", comment_id, ex_dm)
                    comment.dm_thread_id = f"dm_{comment_id}"

                comment.auto_replied = True
                comment.reply_text = pub_reply
                session.add(comment)
                await session.commit()
                logger.warning("Auto-moderation hide comment failed for %s: %s", comment_id, err)

        return comment

    @staticmethod
    async def sync_live_conversations():
        """Poll latest conversations from Meta Graph API for both Messenger and Instagram Direct."""
        if not settings.META_PAGE_ACCESS_TOKEN or not settings.META_PAGE_ID:
            return

        ig_account_id = getattr(settings, "META_INSTAGRAM_ACCOUNT_ID", "17841434176832322")

        platforms = [
            {"name": "messenger", "channel": ChannelEnum.MESSENGER, "endpoint": f"/{settings.META_PAGE_ID}/conversations", "param": None},
            {"name": "instagram", "channel": ChannelEnum.INSTAGRAM, "endpoint": f"/{settings.META_PAGE_ID}/conversations", "param": "instagram"},
            {"name": "instagram_direct", "channel": ChannelEnum.INSTAGRAM, "endpoint": f"/{ig_account_id}/conversations", "param": None}
        ]

        from app.core.database import AsyncSessionLocal
        from app.models.customer import Customer, CustomerIdentity
        from app.models.enums import ConversationStatusEnum, MessageTypeEnum, SenderTypeEnum

        for plat in platforms:
            url = f"https://graph.facebook.com/v23.0{plat['endpoint']}"
            params = {
                "fields": "id,updated_time,unread_count,participants,messages.limit(10){id,message,from,created_time,attachments}",
                "limit": 10,
                "access_token": settings.META_PAGE_ACCESS_TOKEN
            }
            if plat["param"]:
                params["platform"] = plat["param"]

            try:
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                    res = await client.get(url, params=params)
                    if res.status_code != 200:
                        logger.debug("[Live Poller] Platform %s returned status %s", plat["name"], res.status_code)
                        continue
                    data = res.json().get("data", [])

                async with AsyncSessionLocal() as session:
                    for conv_data in data:
                        msgs_data = conv_data.get("messages", {}).get("data", [])
                        if not msgs_data:
                            logger.debug("[Live Poller] Skipping thread %s on platform %s with 0 messages.", conv_data.get("id"), plat["name"])
                            continue

                        ext_conv_id = conv_data.get("id")
                        participants = conv_data.get("participants", {}).get("data", [])

                        # Find external customer participant
                        customer_info = next((p for p in participants if str(p.get("id")) != str(settings.META_PAGE_ID) and str(p.get("id")) != str(ig_account_id)), None)
                        if not customer_info:
                            continue

                        psid = str(customer_info.get("id"))
                        name = customer_info.get("name") or f"عميل {plat['name'].capitalize()} ({psid[-4:]})"

                        # 1. Resolve or Create Customer & Identity
                        id_stmt = select(CustomerIdentity).where(
                            CustomerIdentity.provider == ProviderEnum.META,
                            CustomerIdentity.channel == plat["channel"],
                            CustomerIdentity.external_user_id == psid
                        )
                        identity = (await session.execute(id_stmt)).scalars().first()

                        if not identity:
                            customer = Customer(
                                id=uuid.uuid4(),
                                display_name=name,
                                avatar_url=None,
                            )
                            session.add(customer)
                            await session.flush()

                            identity = CustomerIdentity(
                                id=uuid.uuid4(),
                                customer_id=customer.id,
                                provider=ProviderEnum.META,
                                channel=plat["channel"],
                                external_user_id=psid,
                                metadata_={"source": plat["name"], "psid": psid}
                            )
                            session.add(identity)
                            await session.flush()
                        else:
                            customer = await session.get(Customer, identity.customer_id)

                        if not customer:
                            continue

                        # 2. Resolve or Create Conversation
                        conv_stmt = select(Conversation).where(
                            Conversation.customer_id == customer.id,
                            Conversation.channel == plat["channel"]
                        )
                        conversation = (await session.execute(conv_stmt)).scalars().first()

                        if not conversation:
                            conversation = Conversation(
                                id=uuid.uuid4(),
                                customer_id=customer.id,
                                external_conversation_id=ext_conv_id or f"t_{psid}",
                                channel=plat["channel"],
                                provider=ProviderEnum.META,
                                status=ConversationStatusEnum.OPEN,
                                priority="normal",
                                subject=f"{plat['name'].capitalize()} Conversation {ext_conv_id or psid}",
                                last_message_at=datetime.utcnow()
                            )
                            session.add(conversation)
                            await session.flush()

                        # 3. Ingest Messages & Update Denormalized Preview Fields
                        msgs_data = conv_data.get("messages", {}).get("data", [])
                        has_new_messages = False

                        for m in reversed(msgs_data):
                            mid = m.get("id")
                            if not mid:
                                continue

                            existing_msg = (await session.execute(
                                select(Message).where(Message.external_message_id == mid)
                            )).scalars().first()

                            if not existing_msg:
                                has_new_messages = True
                                sender_id = str(m.get("from", {}).get("id", ""))
                                is_page = sender_id == str(settings.META_PAGE_ID)
                                msg_text = m.get("message", "")
                                created_time_str = m.get("created_time")
                                created_dt = datetime.utcnow()
                                if created_time_str:
                                    try:
                                        created_dt = datetime.fromisoformat(created_time_str.replace("Z", "+00:00")).replace(tzinfo=None)
                                    except Exception:
                                        pass

                                raw_atts = m.get("attachments", {}).get("data", [])
                                att_type = raw_atts[0].get("type", "file") if raw_atts else "text"
                                is_audio = "audio" in att_type or "voice" in att_type
                                is_image = "image" in att_type

                                new_msg = Message(
                                    id=uuid.uuid4(),
                                    conversation_id=conversation.id,
                                    external_message_id=mid,
                                    sender_type=SenderTypeEnum.AGENT if is_page else SenderTypeEnum.CUSTOMER,
                                    sender_external_id=sender_id,
                                    text=msg_text or "",
                                    message_type=MessageTypeEnum.AUDIO if is_audio else (MessageTypeEnum.IMAGE if is_image else MessageTypeEnum.TEXT),
                                    created_at=created_dt,
                                    metadata_={
                                        "attachments": raw_atts,
                                        "from_name": m.get("from", {}).get("name")
                                    }
                                )
                                session.add(new_msg)
                                await session.flush()

                                # Trigger SLA Initialization, Smart Routing & Custom Automation Engine safely for newly polled customer messages
                                if new_msg.sender_type == SenderTypeEnum.CUSTOMER:
                                    try:
                                        from app.services.sla_service import SlaService
                                        from app.services.routing_service import RoutingService

                                        SlaService.start_or_update_sla(conversation, created_dt or datetime.now(timezone.utc))
                                        await RoutingService.assign_conversation_smart(session, conversation)
                                    except Exception as sla_route_err:
                                        logger.error("[SLA & Routing] Poller message processing error: %s", sla_route_err, exc_info=True)

                                if new_msg.sender_type == SenderTypeEnum.CUSTOMER and new_msg.text:
                                    try:
                                        from app.services.automation_service import AutomationService
                                        await AutomationService.evaluate_inbound_message(
                                            session=session,
                                            conversation=conversation,
                                            customer=customer,
                                            text=new_msg.text,
                                        )
                                    except Exception as auto_err:
                                        logger.error("[Automation Engine] Poller message evaluation error: %s", auto_err, exc_info=True)

                                # Update Preview text
                                preview = msg_text
                                if not preview:
                                    preview = "تسجيل صوتي" if is_audio else ("صورة مرفقة" if is_image else "مرفق وسائط")

                                conversation.last_message_text = preview
                                conversation.last_message_at = created_dt
                                conversation.updated_at = created_dt

                        await session.commit()

                        # 4. Emit WebSocket Notification if new messages were found
                        if has_new_messages:
                            try:
                                from app.api.v1.ws import manager
                                await manager.broadcast({
                                    "type": "NEW_MESSAGE",
                                    "conversation_id": str(conversation.id),
                                    "customer_id": str(customer.id),
                                    "customer_display_name": customer.display_name,
                                    "channel": plat["channel"].value,
                                    "text": conversation.last_message_text or "رسالة جديدة"
                                })
                                logger.info("[Live Poller] Synced new message for conversation %s", conversation.id)
                            except Exception as ws_err:
                                logger.debug("[WS Broadcast] Error: %s", ws_err)

            except Exception as ex:
                logger.debug("[Live Poller] Platform %s sync error: %s", plat["name"], ex)

    @classmethod
    async def enrich_customer_profile_background(cls, customer_id: uuid.UUID, sender_psid: str):
        """Asynchronously fetches and updates customer profile info in background session."""
        try:
            pinfo = await cls.fetch_and_cache_customer_profile(sender_psid)
            if not pinfo.get("avatar_url") and not pinfo.get("display_name"):
                return

            async with AsyncSessionLocal() as session:
                cust = await session.get(Customer, customer_id)
                if cust:
                    if pinfo.get("avatar_url"):
                        cust.avatar_url = pinfo["avatar_url"]
                    if pinfo.get("display_name") and cust.display_name == "عميل":
                        cust.display_name = pinfo["display_name"]
                    session.add(cust)
                    await session.commit()
                    logger.info("[Background Profile Enrichment] Updated customer %s (%s)", customer_id, sender_psid)
        except Exception as e:
            logger.warning("[Background Profile Enrichment Error] PSID %s: %s", sender_psid, e)


meta_import_service = MetaImportService()
