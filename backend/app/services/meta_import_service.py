import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone

from typing import Any, Optional
import httpx

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.integrations.meta import MetaAPIError, MetaNormalizer, MetaProvider
from app.models import (
    ChannelEnum,
    ConnectedPage,
    Conversation,
    ConversationStatusEnum,
    Customer,
    CustomerIdentity,
    Message,
    MessageTypeEnum,
    MigrationJob,
    MigrationStatusEnum,
    ProviderEnum,
    SenderTypeEnum,
)
from app.services.conversation_service import ConversationService
from app.services.customer_service import CustomerService
from app.services.message_service import MessageService
from app.services.migration_service import MigrationService
from app.infrastructure.realtime.ws_broadcaster import ws_broadcaster

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

    @classmethod
    async def resolve_brand_name_dynamically(
        cls,
        entry_page_id: Optional[str],
        session: AsyncSession,
        active_connected_pages: Optional[dict[str, ConnectedPage]] = None,
    ) -> str:
        """Dynamically resolve brand name from in-memory pages, DB ConnectedPage, or Meta Graph API.
        Guarantees that brand is never a raw 'Page {id}' placeholder."""
        if not entry_page_id or not str(entry_page_id).strip():
            return "Default Business Page"

        pid = str(entry_page_id).strip()

        # Step A: In-memory active_connected_pages lookup
        if active_connected_pages and pid in active_connected_pages:
            cp = active_connected_pages[pid]
            if cp and cp.name and not str(cp.name).startswith("Page "):
                return cp.name

        # Step B: Query ConnectedPage from DB
        stmt = select(ConnectedPage).where(
            or_(
                ConnectedPage.page_id == pid,
                ConnectedPage.instagram_business_account_id == pid,
            )
        )
        res = await session.execute(stmt)
        cp = res.scalars().first()
        if cp and cp.name and not str(cp.name).startswith("Page "):
            return cp.name

        # Step C: If not in DB, query Meta Graph API dynamically and persist
        token = settings.META_PAGE_ACCESS_TOKEN
        if not token:
            stmt_token = select(ConnectedPage).where(ConnectedPage.status == "ACTIVE").limit(1)
            active_cp = (await session.execute(stmt_token)).scalars().first()
            if active_cp:
                token = active_cp.decrypted_access_token

        if token:
            try:
                api_ver = getattr(settings, "META_GRAPH_API_VERSION", "v23.0")
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as http_client:
                    r = await http_client.get(
                        f"https://graph.facebook.com/{api_ver}/{pid}",
                        params={"fields": "name,id", "access_token": token},
                    )
                    if r.status_code == 200:
                        data = r.json()
                        brand_name = data.get("name")
                        if brand_name and not str(brand_name).startswith("Page "):
                            if cp:
                                cp.name = brand_name
                                await session.flush()
                            else:
                                from app.core.security import encrypt_token
                                new_cp = ConnectedPage(
                                    page_id=pid,
                                    name=brand_name,
                                    encrypted_access_token=encrypt_token(token),
                                    status="ACTIVE",
                                )
                                session.add(new_cp)
                                await session.flush()
                                if active_connected_pages is not None:
                                    active_connected_pages[pid] = new_cp
                            return brand_name
            except Exception as e:
                logger.warning("[Brand Resolution] Failed dynamic lookup for page ID %s: %s", pid, e)

        # Step D: Safe fallback
        fallback = settings.get_page_name(pid)
        if fallback and not str(fallback).startswith("Page "):
            return fallback
        return "Default Business Page"

    @staticmethod
    async def fetch_and_cache_customer_profile(psid: str, page_id: Optional[str] = None) -> dict[str, Any]:
        if not psid or not str(psid).strip() or psid == "unknown_customer" or psid == "system":
            return {}

        configured_pages = settings.get_meta_pages()
        valid_page_ids = {
            p.strip()
            for p in (
                list(configured_pages.keys())
                + [
                    settings.META_PAGE_ID,
                    settings.WHATSAPP_WABA_ID,
                    settings.WHATSAPP_PHONE_NUMBER_ID,
                    settings.INSTAGRAM_ACCOUNT_ID,
                    getattr(settings, "META_APP_ID", None),
                ]
            )
            if p and str(p).strip()
        }
        try:
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session_cp:
                cp_res = await session_cp.execute(select(ConnectedPage))
                for cp in cp_res.scalars().all():
                    if cp.page_id:
                        valid_page_ids.add(str(cp.page_id).strip())
                    if cp.instagram_business_account_id:
                        valid_page_ids.add(str(cp.instagram_business_account_id).strip())
        except Exception:
            pass

        if str(psid).strip() in valid_page_ids:
            return {}

        from app.integrations.meta.rate_limit import MetaRateLimitGuard

        if MetaRateLimitGuard.is_rate_limited():
            logger.debug("[Profile Enrichment] Rate limit cooldown active. Skipping profile fetch for PSID: %s", psid)
            return {}

        if MetaRateLimitGuard.is_psid_failed_recently(psid):
            logger.debug("[Profile Enrichment] PSID %s recently failed lookup (negative cached). Skipping.", psid)
            return {}

        avatars_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
        os.makedirs(avatars_dir, exist_ok=True)

        from app.integrations.meta.client import MetaClient
        token = await MetaClient.get_token_for_page(page_id) if page_id else None
        if not token:
            token = settings.get_page_token(page_id)
        if not token:
            return {}
        url = f"https://graph.facebook.com/v23.0/{psid}?fields=first_name,last_name,profile_pic,locale&access_token={token}"
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                res = await client.get(url)
                MetaRateLimitGuard.inspect_response(res)
                if res.status_code == 200:
                    data = res.json()
                    pic_url = data.get("profile_pic")
                    local_avatar_url = None
                    if pic_url:
                        pic_res = await client.get(
                            pic_url,
                            headers={"Authorization": f"Bearer {token}"},
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
                else:
                    MetaRateLimitGuard.record_failed_psid(psid, ttl_seconds=3600)
        except Exception as e:
            logger.warning("Failed to fetch/cache avatar for PSID %s: %s", psid, e)
            MetaRateLimitGuard.record_failed_psid(psid, ttl_seconds=1800)
        return {}

    @staticmethod
    async def run_import(
        session: AsyncSession,
        page_id: Optional[str] = None,
        channel: ChannelEnum = ChannelEnum.MESSENGER,
        provider_adapter: Optional[MetaProvider] = None,
        since_days: Optional[int] = 30,
    ) -> MigrationJob:
        from app.integrations.meta.client import MetaClient

        target_page_id = page_id or settings.META_PAGE_ID
        client = MetaClient(page_id=target_page_id, db=session)
        adapter = provider_adapter or MetaProvider(client=client, page_id=target_page_id, db=session)

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

        target_page_id = page_info.get("page_id") or target_page_id

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
                        profile_info = await MetaImportService.fetch_and_cache_customer_profile(cust_ext_id, page_id=target_page_id)
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

                brand_name = await MetaImportService.resolve_brand_name_dynamically(
                    entry_page_id=target_page_id,
                    session=session,
                )
                if existing_conv:
                    conv = existing_conv
                    conv.last_message_at = norm_conv.last_message_at
                    if brand_name and (not conv.brand or conv.brand in ("LAVVA", "Default Business Page") or str(conv.brand).startswith("Page ")):
                        conv.brand = brand_name
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
                        brand=brand_name,
                    )

                # Fetch Messages for this conversation (time-bounded to last 7 days)
                norm_messages = await adapter.get_all_messages(
                    conversation_id=norm_conv.external_conversation_id,
                    page_id=target_page_id,
                    since_days=since_days,
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

    @classmethod
    async def discover_and_cache_page_profile(cls, page_id: str) -> dict[str, Any]:
        """Queries Meta Graph API for page name, category, and picture, caching the avatar locally."""
        from app.integrations.meta.client import MetaClient

        client = MetaClient(page_id=page_id)
        metadata = await client.get_page_metadata(page_id=page_id)
        avatar_url = metadata.get("picture_url")
        local_avatar = None
        if avatar_url:
            local_avatar = await cls.download_and_cache_media(avatar_url, media_type="image")

        return {
            "page_id": metadata.get("id", page_id),
            "name": metadata.get("name"),
            "category": metadata.get("category"),
            "avatar_url": local_avatar or avatar_url,
            "raw": metadata.get("raw"),
        }

    @classmethod
    async def subscribe_all_configured_pages(cls) -> list[dict[str, Any]]:
        """Programmatically subscribes all configured pages to webhook events."""
        from app.integrations.meta.client import MetaClient

        pages = settings.get_meta_pages()
        results: list[dict[str, Any]] = []
        for pid, pdata in pages.items():
            token = pdata.get("access_token")
            name = pdata.get("name", f"Page {pid}")
            client = MetaClient(page_id=pid, access_token=token)
            sub_res = await client.subscribe_page_to_app(
                page_id=pid,
                access_token=token,
                subscribed_fields=[
                    "messages",
                    "messaging_postbacks",
                    "message_deliveries",
                    "message_reads",
                    "message_reactions",
                    "feed",
                ],
            )
            results.append(
                {
                    "page_id": pid,
                    "name": name,
                    "success": sub_res.get("success", False),
                    "details": sub_res.get("details"),
                    "error": sub_res.get("error"),
                }
            )
        return results

    @classmethod
    async def sync_all_configured_pages(
        cls,
        session: AsyncSession,
        channel: ChannelEnum = ChannelEnum.MESSENGER,
        since_days: Optional[int] = 30,
    ) -> list[MigrationJob]:
        """Iterates through all pages in settings.get_meta_pages() and connected_pages in DB and executes historical migration."""
        jobs: list[MigrationJob] = []
        pages = settings.get_meta_pages()
        try:
            from app.models.connected_page import ConnectedPage
            stmt = select(ConnectedPage).where(ConnectedPage.status == "ACTIVE")
            db_pages = (await session.execute(stmt)).scalars().all()
            for cp in db_pages:
                if cp.page_id and cp.page_id not in pages:
                    pages[cp.page_id] = {
                        "name": cp.name or f"Page {cp.page_id}",
                        "access_token": cp.decrypted_access_token or "",
                        "category": cp.category or "Business",
                    }
        except Exception as exc:
            logger.warning("[MetaMultiSync] Failed to query active connected_pages from DB: %s", exc)

        logger.info("[MetaMultiSync] Starting batch historical synchronization for %d configured page(s)...", len(pages))
        for pid, pdata in pages.items():
            page_name = pdata.get("name", "Page")
            logger.info("[MetaMultiSync] Syncing page: %s (ID: %s)...", page_name, pid)
            try:
                job = await cls.run_import(
                    session=session, page_id=pid, channel=channel, since_days=since_days
                )
                jobs.append(job)
                logger.info("[MetaMultiSync] Page %s synced: %d convs, %d msgs (status: %s)",
                            page_name, job.processed_conversations, job.processed_messages, job.status)
            except Exception as exc:
                sanitized_err = cls._sanitize_error(str(exc))
                logger.error("[MetaMultiSync] Migration failed for page %s: %s", pid, sanitized_err)
        return jobs

    @staticmethod
    async def download_and_cache_media(url: str, media_type: str = "file") -> str:
        """Download remote asset and cache locally, delegating to MediaStorageGateway."""
        from app.infrastructure.storage.media_storage_gateway import media_storage_gateway
        cached = await media_storage_gateway.download_and_cache_remote_media(
            url=url,
            subfolder="",
            media_type=media_type,
        )
        return cached or url

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
                    from app.infrastructure.media.audio_transcoder import transcode_to_m4a
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
        valid_objects = ["page", "user", "instagram", "whatsapp_business_account", "permissions"]
        if obj_type not in valid_objects:
            logger.info(
                "Meta webhook received object '%s' (extended beyond default %s), processing entries gracefully.",
                obj_type,
                valid_objects,
            )

        entries = raw_payload.get("entry", [])
        if not isinstance(entries, list) or len(entries) == 0:
            logger.warning("Meta webhook: received empty entry list")
            return {"status": "processed", "message": "Ignored empty Meta webhook entry list."}

        # Milestone 3: Query active ConnectedPages from database
        stmt_connected = select(ConnectedPage).where(ConnectedPage.status == "ACTIVE")
        res_connected = await session.execute(stmt_connected)
        active_connected_pages: dict[str, ConnectedPage] = {}
        for cp in res_connected.scalars().all():
            if cp.page_id:
                active_connected_pages[str(cp.page_id).strip()] = cp
            if cp.instagram_business_account_id:
                active_connected_pages[str(cp.instagram_business_account_id).strip()] = cp

        configured_pages = settings.get_meta_pages()
        valid_page_ids = {
            p.strip() for p in (
                list(configured_pages.keys()) + list(active_connected_pages.keys()) + [
                    settings.META_PAGE_ID,
                    settings.WHATSAPP_WABA_ID,
                    settings.WHATSAPP_PHONE_NUMBER_ID,
                    settings.INSTAGRAM_ACCOUNT_ID,
                ]
            ) if p and str(p).strip()
        }
        total_processed = 0
        created_count = 0
        last_result_msg_id = None
        last_result_status = "processed"

        for entry in entries:
            entry_page_id = str(entry.get("id", ""))
            if valid_page_ids and entry_page_id and entry_page_id.strip() not in valid_page_ids:
                if obj_type not in ("user", "instagram", "permissions"):
                    logger.warning("Meta webhook: ignoring entry for ID '%s' (valid IDs: %s)", entry_page_id, valid_page_ids)
                    continue

            # Extract list of items (either entry.messaging, entry.standby, or entry.changes)
            items = []
            channel_hint = ChannelEnum.MESSENGER
            if (
                obj_type == "instagram"
                or "instagram" in str(entry)
                or (entry_page_id in active_connected_pages and active_connected_pages[entry_page_id].instagram_business_account_id == entry_page_id)
            ):
                channel_hint = ChannelEnum.INSTAGRAM


            if "messaging" in entry and isinstance(entry["messaging"], list):
                items.extend(entry["messaging"])
            if "standby" in entry and isinstance(entry["standby"], list):
                items.extend(entry["standby"])
            if "changes" in entry and isinstance(entry["changes"], list):
                channel_hint = ChannelEnum.WHATSAPP
                items.extend(entry["changes"])

            for item in items:
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
                sender_id_clean = str(norm_event.sender_psid or "").strip()
                recipient_id_clean = str(norm_event.recipient_id or "").strip()
                is_self_message = (
                    sender_id_clean in valid_page_ids
                    or sender_id_clean in active_connected_pages
                    or (sender_id_clean == str(settings.META_PAGE_ID))
                    or (sender_id_clean == str(settings.INSTAGRAM_ACCOUNT_ID))
                    or (sender_id_clean == str(settings.WHATSAPP_PHONE_NUMBER_ID))
                    or (sender_id_clean == str(settings.WHATSAPP_WABA_ID))
                    or (sender_id_clean == getattr(settings, "META_APP_ID", ""))
                    or (sender_id_clean == entry_page_id)
                )

                # Early Echo & Self-Message Guard: Handle outbound agent echoes & prevent loops/self-customer creation
                if is_echo or is_self_message or norm_event.sender_type == SenderTypeEnum.AGENT:
                    target_mid = echo_mid or norm_event.external_message_id
                    target_text = echo_text or norm_event.text

                    if recipient_id_clean and recipient_id_clean not in valid_page_ids and recipient_id_clean not in active_connected_pages:
                        target_cust_id = recipient_id_clean
                    elif sender_id_clean and sender_id_clean not in valid_page_ids and sender_id_clean not in active_connected_pages:
                        target_cust_id = sender_id_clean
                    else:
                        target_cust_id = None

                    if not target_mid and target_cust_id:
                        target_mid = f"echo_{int(norm_event.created_at.timestamp())}_{target_cust_id}"

                    logger.info(
                        "[Webhook Echo Handler] Outbound echo/self-message: mid=%s, sender=%s, recipient=%s, is_echo=%s",
                        target_mid,
                        sender_id_clean,
                        recipient_id_clean,
                        is_echo,
                    )

                    # If recipient is missing or is also a page/system account, skip to avoid self-referential cycles
                    if not target_cust_id:
                        logger.info(
                            "[Webhook Echo Guard] Filtered self-addressed or missing recipient: sender=%s, recipient=%s",
                            sender_id_clean,
                            recipient_id_clean,
                        )
                        last_result_status = "already_processed"
                        last_result_msg_id = target_mid
                        continue

                    # 1. Deduplication by external_message_id
                    if target_mid:
                        existing_by_mid = (await session.execute(
                            select(Message).where(Message.external_message_id == target_mid)
                        )).scalar_one_or_none()
                        if existing_by_mid:
                            logger.info(
                                "[Webhook Echo] Deduplicated: mid=%s already exists in DB (id=%s)",
                                target_mid,
                                existing_by_mid.id,
                            )
                            last_result_status = "already_processed"
                            last_result_msg_id = str(existing_by_mid.id)
                            continue

                    # 2. Check if this echo matches a recently sent agent message awaiting mid confirmation
                    id_stmt = select(CustomerIdentity).where(
                        CustomerIdentity.provider == ProviderEnum.META,
                        CustomerIdentity.channel == norm_event.channel,
                        CustomerIdentity.external_user_id == target_cust_id,
                    )
                    ident_res = await session.execute(id_stmt)
                    identity = ident_res.scalars().first()
                    conv = None
                    if identity:
                        conv_stmt = select(Conversation).where(
                            Conversation.customer_id == identity.customer_id,
                            Conversation.channel == norm_event.channel,
                        )
                        conv = (await session.execute(conv_stmt)).scalars().first()

                    if conv and target_text:
                        recent_agent_msg = (await session.execute(
                            select(Message)
                            .where(
                                Message.conversation_id == conv.id,
                                Message.sender_type == SenderTypeEnum.AGENT,
                                Message.text == target_text,
                            )
                            .order_by(Message.created_at.desc())
                            .limit(1)
                        )).scalar_one_or_none()

                        if recent_agent_msg and (
                            not recent_agent_msg.external_message_id
                            or recent_agent_msg.external_message_id.startswith("tmp_")
                        ):
                            recent_agent_msg.external_message_id = target_mid
                            await session.commit()
                            logger.info(
                                "✅ [Echo Deduplicated] Linked Meta MID %s to existing agent message %s",
                                target_mid,
                                recent_agent_msg.id,
                            )
                            last_result_status = "already_processed"
                            last_result_msg_id = target_mid
                            continue

                    # 3. Native outbound agent reply sent outside CRM (e.g. via Instagram / Facebook app)
                    # Resolve or create Customer & Identity for target_cust_id (the customer)
                    customer, identity = await CustomerService.get_or_create_customer_with_identity(
                        session=session,
                        provider=ProviderEnum.META,
                        channel=norm_event.channel,
                        external_user_id=target_cust_id,
                    )

                    if not customer.avatar_url or customer.display_name == "عميل":
                        asyncio.create_task(
                            MetaImportService.enrich_customer_profile_background(
                                customer_id=customer.id,
                                sender_psid=target_cust_id,
                                page_id=entry_page_id,
                            )
                        )

                    brand_name = await MetaImportService.resolve_brand_name_dynamically(
                        entry_page_id=entry_page_id,
                        session=session,
                        active_connected_pages=active_connected_pages,
                    )

                    if not conv:
                        conv = await ConversationService.get_or_create_conversation_for_identity(
                            session=session,
                            identity=identity,
                            brand=brand_name,
                        )

                    if brand_name and (not conv.brand or conv.brand in ("LAVVA", "Default Business Page") or str(conv.brand).startswith("Page ")):
                        conv.brand = brand_name
                        await session.commit()

                    attachments_list = norm_event.attachments
                    first_att = attachments_list[0] if attachments_list and isinstance(attachments_list[0], dict) else {}
                    single_att_url = (
                        first_att.get("url")
                        or first_att.get("payload", {}).get("url")
                        or first_att.get("payload", {}).get("reel_video_url")
                        or first_att.get("share", {}).get("link")
                        or first_att.get("image_data", {}).get("url")
                        or first_att.get("image_data", {}).get("preview_url")
                    ) if first_att else None

                    single_msg_type = norm_event.message_type
                    if first_att and (first_att.get("image_data") or (first_att.get("mime_type") or "").startswith("image/")):
                        single_msg_type = MessageTypeEnum.IMAGE
                    elif first_att and any(k in str(first_att.get("type", "")).lower() for k in ("video", "reel", "ig_reel", "share", "story_mention")):
                        single_msg_type = MessageTypeEnum.VIDEO

                    outbound_metadata = {
                        "direction": "OUTBOUND",
                        "is_from_customer": False,
                        "is_echo": True,
                        "attachments": attachments_list,
                        "media_url": single_att_url,
                        "raw": item,
                    }

                    echo_msg = Message(
                        conversation_id=conv.id,
                        external_message_id=target_mid,
                        sender_type=SenderTypeEnum.AGENT,
                        sender_external_id=sender_id_clean,
                        message_type=single_msg_type,
                        text=target_text,
                        created_at=norm_event.created_at,
                        metadata_=outbound_metadata,
                    )
                    session.add(echo_msg)
                    try:
                        await session.commit()
                        await session.refresh(echo_msg)
                        created_count += 1
                        last_result_status = "success"
                        last_result_msg_id = str(echo_msg.id)

                        if conv.last_message_at is None or norm_event.created_at > conv.last_message_at:
                            conv.last_message_at = norm_event.created_at
                        conv.last_activity_at = norm_event.created_at
                        conv.updated_at = datetime.now(timezone.utc)
                        await session.commit()

                        try:
                            await ws_broadcaster.broadcast_event(
                                target="conversation",
                                conversation_id=str(conv.id),
                                payload={
                                    "type": "NEW_MESSAGE",
                                    "conversation_id": str(conv.id),
                                    "brand": getattr(conv, "brand", None),
                                    "message": {
                                        "id": str(echo_msg.id),
                                        "conversation_id": str(conv.id),
                                        "external_message_id": echo_msg.external_message_id,
                                        "sender_type": "agent",
                                        "sender_external_id": echo_msg.sender_external_id,
                                        "message_type": echo_msg.message_type.value if hasattr(echo_msg.message_type, "value") else str(echo_msg.message_type),
                                        "text": echo_msg.text,
                                        "media_url": single_att_url,
                                        "created_at": echo_msg.created_at.isoformat(),
                                        "delivery_status": "delivered",
                                        "is_from_customer": False,
                                        "direction": "OUTBOUND",
                                        "attachments": attachments_list,
                                        "brand": getattr(conv, "brand", None),
                                    },
                                },
                            )
                        except Exception as ws_err:
                            logger.warning("Failed to broadcast outbound echo message over WebSocket: %s", str(ws_err))

                        logger.info("✅ [Echo Persisted & Broadcast] Native agent reply saved for Conv %s (MID: %s)", conv.id, target_mid)
                    except IntegrityError:
                        await session.rollback()
                        logger.info("[Webhook Echo] Duplicate message %s caught by unique constraint; skipping gracefully.", target_mid)

                    continue

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
                            page_id=entry_page_id,
                        )
                    )

                brand_name = await MetaImportService.resolve_brand_name_dynamically(
                    entry_page_id=entry_page_id,
                    session=session,
                    active_connected_pages=active_connected_pages,
                )

                # 2. Resolve/create Conversation
                conv = await ConversationService.get_or_create_conversation_for_identity(
                    session=session,
                    identity=identity,
                    brand=brand_name,
                )

                if brand_name and (not conv.brand or conv.brand in ("LAVVA", "Default Business Page") or str(conv.brand).startswith("Page ")):
                    conv.brand = brand_name
                    await session.commit()

                if norm_event.metadata_ and norm_event.metadata_.get("referral"):
                    logger.info("Referral attribution detected: %s", norm_event.metadata_["referral"])

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
                        elif isinstance(att, dict) and any(k in str(att.get("type", "")).lower() for k in ("video", "reel", "ig_reel", "share", "story_mention")):
                            att_type = "video"
                        att_url = (
                            att.get("url")
                            or att.get("payload", {}).get("url")
                            or att.get("payload", {}).get("reel_video_url")
                            or att.get("share", {}).get("link")
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
                        try:
                            await session.commit()
                            await session.refresh(msg)
                            created_count += 1
                            last_result_status = "success"
                            last_result_msg_id = str(msg.id)

                            try:
                                await ws_broadcaster.broadcast_event(
                                    target="conversation",
                                    conversation_id=str(conv.id),
                                    payload={
                                        "type": "NEW_MESSAGE",
                                        "conversation_id": str(conv.id),
                                        "brand": getattr(conv, "brand", None),
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
                                            "brand": getattr(conv, "brand", None),
                                        },
                                    },
                                )
                            except Exception as ws_err:
                                logger.warning("Failed to broadcast multi-attachment WS: %s", str(ws_err))
                            logger.info(f"[Webhook Multi-Media] Saved attachment {idx+1}/{len(attachments_list)} (ID: {att_mid}) for Conv {conv.id}")
                        except IntegrityError:
                            await session.rollback()
                            logger.info("[Webhook Multi-Media] Duplicate message %s caught by unique constraint; skipping gracefully.", att_mid)
                            continue
                else:
                    first_att = attachments_list[0] if attachments_list and isinstance(attachments_list[0], dict) else {}
                    single_att_url = (
                        first_att.get("url")
                        or first_att.get("payload", {}).get("url")
                        or first_att.get("payload", {}).get("reel_video_url")
                        or first_att.get("share", {}).get("link")
                        or first_att.get("image_data", {}).get("url")
                        or first_att.get("image_data", {}).get("preview_url")
                    ) if first_att else None

                    single_msg_type = norm_event.message_type
                    if first_att and (first_att.get("image_data") or (first_att.get("mime_type") or "").startswith("image/")):
                        single_msg_type = MessageTypeEnum.IMAGE
                    elif first_att and any(k in str(first_att.get("type", "")).lower() for k in ("video", "reel", "ig_reel", "share", "story_mention")):
                        single_msg_type = MessageTypeEnum.VIDEO

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
                    try:
                        await session.commit()
                        await session.refresh(msg)
                        created_count += 1
                        last_result_status = "success"
                        last_result_msg_id = str(msg.id)

                        try:
                            await ws_broadcaster.broadcast_event(
                                target="conversation",
                                conversation_id=str(conv.id),
                                payload={
                                    "type": "NEW_MESSAGE",
                                    "conversation_id": str(conv.id),
                                    "brand": getattr(conv, "brand", None),
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
                                        "brand": getattr(conv, "brand", None),
                                    },
                                },
                            )
                        except Exception as ws_err:
                            logger.warning("Failed to broadcast inbound message over WebSocket: %s", str(ws_err))
                        logger.info("Meta webhook success: message_id=%s persisted (id=%s)", norm_event.external_message_id, msg.id)
                    except IntegrityError:
                        await session.rollback()
                        logger.info("[Webhook Inbound] Duplicate message %s caught by unique constraint; returning already_processed.", norm_event.external_message_id)
                        return "already_processed"

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

                    # Moderation & Bad Words Filter
                    if norm_event.text:
                        try:
                            from app.services.moderation_service import ModerationService
                            matched = ModerationService.scan_for_bad_words(norm_event.text)
                            if matched:
                                await ModerationService.handle_detected_bad_words(
                                    session=session,
                                    matched_words=matched,
                                    message_text=norm_event.text,
                                    sender_type="customer",
                                    sender_name=customer.display_name or "العميل",
                                    sender_id=str(customer.id),
                                    conversation_id=conv.id,
                                    customer_name=customer.display_name or "عميل",
                                    brand_name=conv.brand,
                                    channel=conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel),
                                )
                        except Exception as mod_err:
                            logger.error(f"[Moderation Engine] Error scanning inbound message: {mod_err}", exc_info=True)



        return {
            "status": last_result_status,
            "processed_events": total_processed,
            "messages_created": created_count,
            "last_message_id": last_result_msg_id,
        }

    @staticmethod
    async def sync_live_conversations():
        """Poll latest conversations from Meta Graph API for both Messenger and Instagram Direct across all connected pages."""
        from app.integrations.meta.rate_limit import MetaRateLimitGuard
        from app.core.database import AsyncSessionLocal
        from app.models.connected_page import ConnectedPage
        from app.models.customer import Customer, CustomerIdentity
        from app.models.enums import ConversationStatusEnum, MessageTypeEnum, SenderTypeEnum

        if MetaRateLimitGuard.is_rate_limited():
            rem = MetaRateLimitGuard.get_cooldown_remaining()
            logger.warning("[Live Poller] Meta rate limit cooldown active (%ds remaining). Skipping poll cycle.", int(rem))
            return

        platforms: list[dict[str, Any]] = []
        known_account_ids: set[str] = set()

        async with AsyncSessionLocal() as session:
            stmt_cp = select(ConnectedPage).where(ConnectedPage.status == "ACTIVE")
            active_cps = (await session.execute(stmt_cp)).scalars().all()
            for cp in active_cps:
                token = cp.decrypted_access_token or settings.META_PAGE_ACCESS_TOKEN
                if not token:
                    continue
                if cp.page_id:
                    pid = str(cp.page_id).strip()
                    known_account_ids.add(pid)
                    platforms.append({
                        "name": f"messenger_{pid}",
                        "channel": ChannelEnum.MESSENGER,
                        "endpoint": f"/{pid}/conversations",
                        "param": None,
                        "token": token,
                        "brand": cp.name,
                    })
                    platforms.append({
                        "name": f"instagram_{pid}",
                        "channel": ChannelEnum.INSTAGRAM,
                        "endpoint": f"/{pid}/conversations",
                        "param": "instagram",
                        "token": token,
                        "brand": cp.name,
                    })
                if cp.instagram_business_account_id:
                    ig_id = str(cp.instagram_business_account_id).strip()
                    known_account_ids.add(ig_id)
                    platforms.append({
                        "name": f"instagram_direct_{ig_id}",
                        "channel": ChannelEnum.INSTAGRAM,
                        "endpoint": f"/{ig_id}/conversations",
                        "param": None,
                        "token": token,
                        "brand": cp.name,
                    })

        # Safe fallback if no ConnectedPage in DB but settings exist
        if not platforms and settings.META_PAGE_ACCESS_TOKEN and settings.META_PAGE_ID:
            pid = str(settings.META_PAGE_ID).strip()
            known_account_ids.add(pid)
            if getattr(settings, "INSTAGRAM_ACCOUNT_ID", None):
                known_account_ids.add(str(settings.INSTAGRAM_ACCOUNT_ID).strip())
            brand_fallback = settings.get_page_name(pid)
            platforms.append({
                "name": f"messenger_{pid}",
                "channel": ChannelEnum.MESSENGER,
                "endpoint": f"/{pid}/conversations",
                "param": None,
                "token": settings.META_PAGE_ACCESS_TOKEN,
                "brand": brand_fallback,
            })
            platforms.append({
                "name": f"instagram_{pid}",
                "channel": ChannelEnum.INSTAGRAM,
                "endpoint": f"/{pid}/conversations",
                "param": "instagram",
                "token": settings.META_PAGE_ACCESS_TOKEN,
                "brand": brand_fallback,
            })
            if getattr(settings, "INSTAGRAM_ACCOUNT_ID", None):
                ig_id = str(settings.INSTAGRAM_ACCOUNT_ID).strip()
                platforms.append({
                    "name": f"instagram_direct_{ig_id}",
                    "channel": ChannelEnum.INSTAGRAM,
                    "endpoint": f"/{ig_id}/conversations",
                    "param": None,
                    "token": settings.META_PAGE_ACCESS_TOKEN,
                    "brand": brand_fallback,
                })

        if not platforms:
            return

        for plat in platforms:
            if MetaRateLimitGuard.is_rate_limited():
                logger.warning("[Live Poller] Rate limit triggered during platform loop. Halting cycle.")
                break

            url = f"https://graph.facebook.com/v23.0{plat['endpoint']}"
            params = {
                "fields": "id,updated_time,unread_count,participants,messages.limit(10){id,message,from,created_time,attachments}",
                "limit": 10,
                "access_token": plat["token"],
            }
            if plat["param"]:
                params["platform"] = plat["param"]

            try:
                async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                    res = await client.get(url, params=params)
                    MetaRateLimitGuard.inspect_response(res)
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
                        customer_info = next((p for p in participants if str(p.get("id")) not in known_account_ids), None)
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
                                brand=plat.get("brand") or "Default Business Page",
                                last_message_at=datetime.utcnow()
                            )
                            session.add(conversation)
                            await session.flush()
                        elif plat.get("brand") and (not conversation.brand or conversation.brand in ("LAVVA", "Default Business Page") or str(conversation.brand).startswith("Page ")):
                            conversation.brand = plat["brand"]

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
                                is_page = sender_id in known_account_ids
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

                                    try:
                                        from app.services.moderation_service import ModerationService
                                        matched = ModerationService.scan_for_bad_words(new_msg.text)
                                        if matched:
                                            await ModerationService.handle_detected_bad_words(
                                                session=session,
                                                matched_words=matched,
                                                message_text=new_msg.text,
                                                sender_type="customer",
                                                sender_name=customer.display_name or "العميل",
                                                sender_id=str(customer.id),
                                                conversation_id=conversation.id,
                                                customer_name=customer.display_name or "عميل",
                                                brand_name=conversation.brand,
                                                channel=conversation.channel.value if hasattr(conversation.channel, "value") else str(conversation.channel),
                                            )
                                    except Exception as mod_err:
                                        logger.error("[Moderation Engine] Poller moderation error: %s", mod_err, exc_info=True)

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
                                await ws_broadcaster.broadcast_event(
                                    target="conversation",
                                    conversation_id=str(conversation.id),
                                    payload={
                                        "type": "NEW_MESSAGE",
                                        "conversation_id": str(conversation.id),
                                        "customer_id": str(customer.id),
                                        "customer_display_name": customer.display_name,
                                        "brand": getattr(conversation, "brand", None),
                                        "channel": plat["channel"].value,
                                        "text": conversation.last_message_text or "رسالة جديدة",
                                    },
                                )
                                logger.info("[Live Poller] Synced new message for conversation %s", conversation.id)
                            except Exception as ws_err:
                                logger.debug("[WS Broadcast] Error: %s", ws_err)

            except Exception as ex:
                logger.debug("[Live Poller] Platform %s sync error: %s", plat["name"], ex)

    @classmethod
    async def enrich_customer_profile_background(cls, customer_id: uuid.UUID, sender_psid: str, page_id: Optional[str] = None):
        """Asynchronously fetches and updates customer profile info in background session."""
        try:
            pinfo = await cls.fetch_and_cache_customer_profile(sender_psid, page_id=page_id)
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
