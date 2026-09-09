import asyncio
import logging
import json
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4
import httpx
from sqlalchemy import or_, select
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.enums import (
    ChannelEnum,
    ProviderEnum,
    ConversationStatusEnum,
    SenderTypeEnum,
    MessageTypeEnum,
)
from app.models.customer import Customer, CustomerIdentity
from app.models.conversation import Conversation
from app.models.message import Message
from app.services.meta_payload_normalizer import MetaPayloadNormalizer
from app.core.country_detector import CountryDetector

logger = logging.getLogger("MetaHistoricalSync")


class MetaHistoricalSyncService:
    def __init__(self):
        self.api_ver = getattr(settings, "META_GRAPH_API_VERSION", "v23.0")
        self.base_url = f"https://graph.facebook.com/{self.api_ver}"
        self.headers = {"Authorization": f"Bearer {settings.META_PAGE_ACCESS_TOKEN}"}

    async def _get_known_account_ids(self) -> set[str]:
        from app.models.connected_page import ConnectedPage
        known: set[str] = set()
        if settings.META_PAGE_ID:
            known.add(str(settings.META_PAGE_ID).strip())
        if getattr(settings, "INSTAGRAM_ACCOUNT_ID", None):
            known.add(str(settings.INSTAGRAM_ACCOUNT_ID).strip())
        try:
            async with AsyncSessionLocal() as session:
                cps = (await session.execute(select(ConnectedPage))).scalars().all()
                for cp in cps:
                    if cp.page_id:
                        known.add(str(cp.page_id).strip())
                    if cp.instagram_business_account_id:
                        known.add(str(cp.instagram_business_account_id).strip())
        except Exception:
            pass
        return known

    async def _resolve_brand_for_page(self, page_id: Optional[str]) -> str:
        if not page_id:
            return "Default Business Page"
        pid = str(page_id).strip()
        from app.models.connected_page import ConnectedPage
        try:
            async with AsyncSessionLocal() as session:
                stmt = select(ConnectedPage).where(
                    or_(
                        ConnectedPage.page_id == pid,
                        ConnectedPage.instagram_business_account_id == pid,
                    )
                )
                cp = (await session.execute(stmt)).scalars().first()
                if cp and cp.name and not str(cp.name).startswith("Page "):
                    return cp.name
        except Exception:
            pass
        fallback = settings.get_page_name(pid)
        if fallback and not str(fallback).startswith("Page "):
            return fallback
        return "Default Business Page"

    async def _inspect_rate_limits_and_throttle(self, response: httpx.Response):
        """Inspect Meta usage headers and throttle dynamically to avoid 429/613 errors."""
        from app.integrations.meta.rate_limit import MetaRateLimitGuard
        MetaRateLimitGuard.inspect_response(response)

        usage_header = response.headers.get("x-page-usage") or response.headers.get("x-app-usage")
        if usage_header:
            try:
                usage = json.loads(usage_header)
                call_count = usage.get("call_count", 0)
                cpu_time = usage.get("total_cputime", 0)

                if call_count > 75 or cpu_time > 75:
                    throttle_sec = 3.0 if (call_count < 90 and cpu_time < 90) else 6.0
                    logger.warning("[RateLimit Guard] Usage high (%s). Sleeping %ss...", usage, throttle_sec)
                    await asyncio.sleep(throttle_sec)
            except Exception:
                pass

    async def sync_all_historical_threads(
        self,
        platform: Optional[str] = None,
        max_threads: int = 100,
        page_id: Optional[str] = None,
        access_token: Optional[str] = None,
    ):
        """
        Two-Tier Shallow Thread Discovery with Cursor Pagination.
        platform: None (Messenger) | 'instagram' (Instagram Direct)
        """
        channel = ChannelEnum.INSTAGRAM if platform == "instagram" else ChannelEnum.MESSENGER
        logger.info("[%s] Starting historical sync (Max Threads: %d)...", channel.value.upper(), max_threads)

        from app.models.connected_page import ConnectedPage

        targets: list[dict[str, Any]] = []
        if page_id:
            brand = await self._resolve_brand_for_page(page_id)
            token = access_token or settings.META_PAGE_ACCESS_TOKEN
            if not token:
                async with AsyncSessionLocal() as session:
                    stmt = select(ConnectedPage).where(ConnectedPage.page_id == str(page_id).strip())
                    cp = (await session.execute(stmt)).scalars().first()
                    if cp:
                        token = cp.decrypted_access_token
            targets.append({
                "page_id": str(page_id).strip(),
                "access_token": token,
                "brand": brand,
            })
        else:
            async with AsyncSessionLocal() as session:
                cps = (await session.execute(select(ConnectedPage).where(ConnectedPage.status == "ACTIVE"))).scalars().all()
                for cp in cps:
                    token = cp.decrypted_access_token or settings.META_PAGE_ACCESS_TOKEN
                    if not token:
                        continue
                    if platform == "instagram" and cp.instagram_business_account_id:
                        targets.append({
                            "page_id": str(cp.instagram_business_account_id).strip(),
                            "access_token": token,
                            "brand": cp.name,
                        })
                    elif cp.page_id:
                        targets.append({
                            "page_id": str(cp.page_id).strip(),
                            "access_token": token,
                            "brand": cp.name,
                        })

            if not targets and settings.META_PAGE_ID and settings.META_PAGE_ACCESS_TOKEN:
                targets.append({
                    "page_id": str(settings.META_PAGE_ID).strip(),
                    "access_token": settings.META_PAGE_ACCESS_TOKEN,
                    "brand": await self._resolve_brand_for_page(settings.META_PAGE_ID),
                })

        known_account_ids = await self._get_known_account_ids()
        total_synced_threads = 0

        for target in targets:
            tgt_page_id = target["page_id"]
            tgt_token = target["access_token"]
            tgt_brand = target["brand"]
            url = f"{self.base_url}/{tgt_page_id}/conversations"
            params = {
                "fields": "id,updated_time,participants",
                "limit": 25,
                "access_token": tgt_token,
            }
            if platform:
                params["platform"] = platform

            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                while url and total_synced_threads < max_threads:
                    try:
                        res = await client.get(url, params=params if "?" not in url else None)
                        await self._inspect_rate_limits_and_throttle(res)

                        if res.status_code != 200:
                            logger.warning(
                                "[%s] Failed to fetch conversation page for %s status=%s: %s",
                                channel.value,
                                tgt_page_id,
                                res.status_code,
                                res.text,
                            )
                            break

                        payload = res.json()
                        threads = payload.get("data", [])
                        if not threads:
                            break

                        for th in threads:
                            thread_id = th.get("id")
                            participants = th.get("participants", {}).get("data", [])

                            customer_info = next(
                                (
                                    p
                                    for p in participants
                                    if str(p.get("id")) not in known_account_ids
                                ),
                                None,
                            )
                            if not customer_info:
                                continue

                            psid = str(customer_info.get("id"))
                            name = (
                                customer_info.get("name")
                                or customer_info.get("username")
                                or f"عميل {channel.value} ({psid[-4:]})"
                            )

                            await self._hydrate_thread_messages(
                                client=client,
                                thread_id=thread_id,
                                external_user_id=psid,
                                display_name=name,
                                channel=channel,
                                brand=tgt_brand,
                                access_token=tgt_token,
                                known_account_ids=known_account_ids,
                            )
                            total_synced_threads += 1

                        url = payload.get("paging", {}).get("next")
                        params = None
                        await asyncio.sleep(0.5)

                    except Exception as e:
                        logger.error("[%s] Exception during thread discovery for %s: %s", channel.value, tgt_page_id, e)
                        break

        logger.info(
            "[%s] Historical sync completed. Processed %d threads.",
            channel.value.upper(),
            total_synced_threads,
        )

    def _parse_instagram_message_payload(self, m: dict[str, Any]) -> dict[str, Any]:
        """Polymorphic parser extracting real content for Reels, Shares, Images, Videos, and Audio."""
        text = m.get("message", "")
        shares = m.get("shares", {}).get("data", [])
        attachments = m.get("attachments", {}).get("data", [])

        media_url = None
        message_type = MessageTypeEnum.TEXT

        # 1. Inspect Shares (Reels, Feed Posts, External Links)
        if shares:
            share = shares[0]
            share_link = share.get("link")
            share_name = share.get("name", "مشاركة ريل / منشور إنستغرام")
            message_type = MessageTypeEnum.FILE
            media_url = share_link
            text = text or f"🎬 {share_name}\n{share_link if share_link else ''}".strip()

        # 2. Inspect Attachments (Images, Videos, Voice Audio)
        elif attachments:
            att = attachments[0]
            if "video_data" in att:
                message_type = MessageTypeEnum.FILE
                media_url = att["video_data"].get("url")
                text = text or "مقطع فيديو مرفق"
            elif "image_data" in att:
                message_type = MessageTypeEnum.IMAGE
                media_url = att["image_data"].get("url")
                text = text or "صورة مرفقة"
            elif "file_url" in att:
                file_url = att.get("file_url", "")
                mime = att.get("mime_type", "")
                if "audio" in mime or "voice" in file_url or file_url.endswith((".m4a", ".mp3", ".aac", ".wav")):
                    message_type = MessageTypeEnum.AUDIO
                    media_url = file_url
                    text = text or "تسجيل صوتي"
                else:
                    message_type = MessageTypeEnum.FILE
                    media_url = file_url
                    text = text or "ملف مرفق"
            else:
                message_type = MessageTypeEnum.FILE
                text = text or "مرفق وسائط"

        return {
            "text": text or "رسالة تفاعلية",
            "message_type": message_type,
            "media_url": media_url,
            "shares": shares,
            "attachments": attachments,
        }

    async def harvest_all_instagram_conversations(
        self,
        max_threads: int = 100,
        page_id: Optional[str] = None,
        access_token: Optional[str] = None,
    ):
        """Phase 1 & Phase 2: Harvest all Instagram thread IDs and deeply hydrate all message payloads."""
        logger.info("=== [PHASE 1] HARVESTING ALL INSTAGRAM THREADS (Limit: %d) ===", max_threads)
        from app.models.connected_page import ConnectedPage

        tgt_page_id = str(page_id or settings.META_PAGE_ID or "").strip()
        tgt_token = access_token or settings.META_PAGE_ACCESS_TOKEN
        brand = None

        if not tgt_token or not brand:
            async with AsyncSessionLocal() as session:
                stmt = select(ConnectedPage).where(
                    or_(
                        ConnectedPage.page_id == tgt_page_id,
                        ConnectedPage.instagram_business_account_id == tgt_page_id,
                    )
                )
                cp = (await session.execute(stmt)).scalars().first()
                if cp:
                    tgt_token = tgt_token or cp.decrypted_access_token
                    brand = cp.name

        if not brand:
            brand = await self._resolve_brand_for_page(tgt_page_id)

        url = f"{self.base_url}/{tgt_page_id}/conversations"
        params = {
            "platform": "instagram",
            "fields": "id,updated_time,participants",
            "limit": 25,
            "access_token": tgt_token,
        }

        harvested_threads: list[dict[str, Any]] = []
        known_account_ids = await self._get_known_account_ids()

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            while url and len(harvested_threads) < max_threads:
                try:
                    res = await client.get(url, params=params if "?" not in url else None)
                    await self._inspect_rate_limits_and_throttle(res)

                    if res.status_code != 200:
                        logger.error("[Harvester] Graph API Error: %s - %s", res.status_code, res.text)
                        break

                    data = res.json()
                    threads = data.get("data", [])
                    if not threads:
                        break

                    for th in threads:
                        participants = th.get("participants", {}).get("data", [])
                        customer_info = next(
                            (
                                p
                                for p in participants
                                if str(p.get("id")) not in known_account_ids
                            ),
                            participants[0] if participants else None,
                        )
                        if customer_info:
                            harvested_threads.append({
                                "thread_id": th.get("id"),
                                "updated_time": th.get("updated_time"),
                                "user_id": str(customer_info.get("id")),
                                "username": customer_info.get("username")
                                or customer_info.get("name")
                                or f"عميل Instagram ({str(customer_info.get('id'))[-4:]})",
                            })

                    url = data.get("paging", {}).get("next")
                    params = None
                    await asyncio.sleep(0.3)
                except Exception as e:
                    logger.error("[Harvester] Exception during discovery: %s", e)
                    break

        logger.info("=== [PHASE 1 COMPLETE] Harvested %d Instagram threads ===", len(harvested_threads))

        # Phase 2: Sequential Deep Hydration Loop
        logger.info("=== [PHASE 2] STARTING SEQUENTIAL THREAD HYDRATION LOOP ===")
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for idx, item in enumerate(harvested_threads, start=1):
                logger.info(
                    "Hydrating [%d/%d] Thread: %s (%s)",
                    idx,
                    len(harvested_threads),
                    item["username"],
                    item["thread_id"],
                )
                await self._deep_hydrate_instagram_thread(
                    client,
                    item,
                    brand=brand,
                    access_token=tgt_token,
                    known_account_ids=known_account_ids,
                )
                await asyncio.sleep(0.5)

    async def _deep_hydrate_instagram_thread(
        self,
        client: httpx.AsyncClient,
        thread_info: dict[str, Any],
        brand: Optional[str] = None,
        access_token: Optional[str] = None,
        known_account_ids: Optional[set[str]] = None,
    ):
        """Phase 2: Hydrate single Instagram thread with full pagination and polymorphic parsing."""
        thread_id = thread_info["thread_id"]
        external_user_id = thread_info["user_id"]
        display_name = thread_info["username"]

        if known_account_ids is None:
            known_account_ids = await self._get_known_account_ids()
        if brand is None:
            brand = await self._resolve_brand_for_page(settings.META_PAGE_ID)
        tgt_token = access_token or settings.META_PAGE_ACCESS_TOKEN

        async with AsyncSessionLocal() as session:
            id_stmt = select(CustomerIdentity).where(
                CustomerIdentity.provider == ProviderEnum.META,
                CustomerIdentity.channel == ChannelEnum.INSTAGRAM,
                CustomerIdentity.external_user_id == external_user_id,
            )
            identity = (await session.execute(id_stmt)).scalars().first()

            if not identity:
                customer = Customer(
                    id=uuid4(),
                    display_name=display_name,
                    avatar_url=None,
                )
                session.add(customer)
                await session.flush()

                identity = CustomerIdentity(
                    id=uuid4(),
                    customer_id=customer.id,
                    provider=ProviderEnum.META,
                    channel=ChannelEnum.INSTAGRAM,
                    external_user_id=external_user_id,
                    metadata_={"source": "instagram", "external_id": external_user_id},
                )
                session.add(identity)
                await session.flush()
            else:
                customer = await session.get(Customer, identity.customer_id)

            if not customer:
                return

            conv_stmt = select(Conversation).where(
                Conversation.provider == ProviderEnum.META,
                Conversation.channel == ChannelEnum.INSTAGRAM,
                Conversation.external_conversation_id == thread_id,
            )
            conversation = (await session.execute(conv_stmt)).scalars().first()

            if not conversation:
                conversation = Conversation(
                    id=uuid4(),
                    customer_id=customer.id,
                    external_conversation_id=thread_id,
                    channel=ChannelEnum.INSTAGRAM,
                    provider=ProviderEnum.META,
                    status=ConversationStatusEnum.OPEN,
                    priority="normal",
                    brand=brand or "Default Business Page",
                    last_message_at=datetime.utcnow(),
                )
                session.add(conversation)
                await session.flush()
            elif brand and (not conversation.brand or conversation.brand in ("LAVVA", "Default Business Page") or str(conversation.brand).startswith("Page ")):
                conversation.brand = brand
                await session.flush()

            msg_url = f"{self.base_url}/{thread_id}"
            msg_params = {
                "fields": "messages.limit(50){id,created_time,from,to,message,attachments{id,mime_type,file_url,image_data,video_data,target},shares{id,link,name}}",
                "access_token": tgt_token,
            }

            is_root = True
            while msg_url:
                try:
                    res = await client.get(msg_url, params=msg_params if is_root else None)
                    is_root = False
                    await self._inspect_rate_limits_and_throttle(res)

                    if res.status_code != 200:
                        break

                    data = res.json()
                    if "messages" in data and isinstance(data["messages"], dict):
                        raw_msgs = data["messages"].get("data", [])
                        paging = data["messages"].get("paging", {})
                    else:
                        raw_msgs = data.get("data", [])
                        paging = data.get("paging", {})

                    if not raw_msgs:
                        break

                    for m in raw_msgs:
                        mid = m.get("id")
                        if not mid:
                            continue

                        norm = MetaPayloadNormalizer.normalize_instagram_message(m)
                        if not norm or (not norm.text and not norm.media_url):
                            continue
                        sender_id = str(m.get("from", {}).get("id", ""))
                        sender_username = m.get("from", {}).get("username", "")
                        is_page = sender_id in known_account_ids

                        created_dt = datetime.utcnow()
                        if m.get("created_time"):
                            try:
                                created_dt = datetime.fromisoformat(
                                    m["created_time"].replace("Z", "+00:00")
                                ).replace(tzinfo=None)
                            except Exception:
                                pass

                        existing = (
                            await session.execute(
                                select(Message).where(Message.external_message_id == mid)
                            )
                        ).scalars().first()

                        if not existing:
                            new_msg = Message(
                                id=uuid4(),
                                conversation_id=conversation.id,
                                external_message_id=mid,
                                sender_type=SenderTypeEnum.AGENT if is_page else SenderTypeEnum.CUSTOMER,
                                sender_external_id=sender_id or sender_username,
                                text=norm.text or "",
                                message_type=norm.message_type,
                                created_at=created_dt,
                                metadata_={
                                    "media_url": norm.media_url,
                                    "from_name": m.get("from", {}).get("name") or sender_username,
                                    **norm.metadata,
                                },
                            )
                            session.add(new_msg)
                        else:
                            existing.text = norm.text or ""
                            existing.message_type = norm.message_type
                            existing.metadata_ = {
                                **(existing.metadata_ or {}),
                                "media_url": norm.media_url,
                                **norm.metadata,
                            }

                        text_for_loc = norm.text or m.get("message", "")
                        loc = CountryDetector.extract_country(text_for_loc)
                        if loc and customer:
                            customer.location = loc
                            session.add(customer)

                    await session.commit()
                    msg_url = paging.get("next")
                    msg_params = None
                    await asyncio.sleep(0.2)

                except Exception as e:
                    logger.error("[Hydration Error] Thread %s: %s", thread_id, e)
                    break

    async def _hydrate_thread_messages(
        self,
        client: httpx.AsyncClient,
        thread_id: str,
        external_user_id: str,
        display_name: str,
        channel: ChannelEnum,
        brand: Optional[str] = None,
        access_token: Optional[str] = None,
        known_account_ids: Optional[set[str]] = None,
    ):
        """Paginate and ingest all historical messages for a thread across Messenger and Instagram."""
        if channel == ChannelEnum.INSTAGRAM:
            await self._deep_hydrate_instagram_thread(
                client,
                {"thread_id": thread_id, "user_id": external_user_id, "username": display_name},
                brand=brand,
                access_token=access_token,
                known_account_ids=known_account_ids,
            )
            return

        if known_account_ids is None:
            known_account_ids = await self._get_known_account_ids()
        if brand is None:
            brand = await self._resolve_brand_for_page(settings.META_PAGE_ID)
        tgt_token = access_token or settings.META_PAGE_ACCESS_TOKEN

        msg_url = f"{self.base_url}/{thread_id}/messages"
        msg_params = {
            "fields": "id,created_time,from,to,message,attachments{id,mime_type,file_url,image_data,video_data}",
            "limit": 50,
            "access_token": tgt_token,
        }

        async with AsyncSessionLocal() as session:
            id_stmt = select(CustomerIdentity).where(
                CustomerIdentity.provider == ProviderEnum.META,
                CustomerIdentity.channel == channel,
                CustomerIdentity.external_user_id == external_user_id,
            )
            identity = (await session.execute(id_stmt)).scalars().first()

            if not identity:
                customer = Customer(
                    id=uuid4(),
                    display_name=display_name,
                    avatar_url=None,
                )
                session.add(customer)
                await session.flush()

                identity = CustomerIdentity(
                    id=uuid4(),
                    customer_id=customer.id,
                    provider=ProviderEnum.META,
                    channel=channel,
                    external_user_id=external_user_id,
                    metadata_={"source": channel.value, "external_id": external_user_id},
                )
                session.add(identity)
                await session.flush()
            else:
                customer = await session.get(Customer, identity.customer_id)

            if not customer:
                return

            conv_stmt = select(Conversation).where(
                Conversation.provider == ProviderEnum.META,
                Conversation.channel == channel,
                Conversation.external_conversation_id == thread_id,
            )
            conversation = (await session.execute(conv_stmt)).scalars().first()

            if not conversation:
                conversation = Conversation(
                    id=uuid4(),
                    customer_id=customer.id,
                    external_conversation_id=thread_id,
                    channel=channel,
                    provider=ProviderEnum.META,
                    status=ConversationStatusEnum.OPEN,
                    priority="normal",
                    brand=brand or "Default Business Page",
                    last_message_at=datetime.utcnow(),
                )
                session.add(conversation)
                await session.flush()
            elif brand and (not conversation.brand or conversation.brand in ("LAVVA", "Default Business Page") or str(conversation.brand).startswith("Page ")):
                conversation.brand = brand
                await session.flush()

            is_first_request = True

            while msg_url:
                try:
                    res = await client.get(msg_url, params=msg_params if is_first_request else None)
                    is_first_request = False
                    await self._inspect_rate_limits_and_throttle(res)

                    if res.status_code != 200:
                        logger.error("[%s] Failed fetching messages for %s: %s %s", channel.value, thread_id, res.status_code, res.text)
                        break

                    data = res.json()
                    raw_messages = data.get("data", [])
                    paging = data.get("paging", {})

                    if not raw_messages:
                        break

                    for m in raw_messages:
                        mid = m.get("id")
                        if not mid:
                            continue

                        sender_id = str(m.get("from", {}).get("id", ""))
                        sender_name = m.get("from", {}).get("name", "")
                        is_page = sender_id in known_account_ids
                        text = m.get("message", "")

                        created_dt = datetime.utcnow()
                        if m.get("created_time"):
                            try:
                                created_dt = datetime.fromisoformat(
                                    m["created_time"].replace("Z", "+00:00")
                                ).replace(tzinfo=None)
                            except Exception:
                                pass

                        attachments = m.get("attachments", {}).get("data", [])

                        if not attachments:
                            # Standard text message
                            await self._persist_messenger_msg(
                                session=session,
                                conversation_id=conversation.id,
                                mid=mid,
                                is_page=is_page,
                                sender_id=sender_id or sender_name,
                                text=text or "",
                                message_type=MessageTypeEnum.TEXT,
                                media_url=None,
                                created_dt=created_dt,
                                metadata={"from_name": sender_name},
                            )
                        else:
                            # Iterate through ALL attachments in batch
                            for idx, att in enumerate(attachments):
                                sub_mid = f"{mid}_{idx}" if len(attachments) > 1 else mid
                                media_url = None
                                msg_type = MessageTypeEnum.FILE

                                if "video_data" in att:
                                    msg_type = MessageTypeEnum.VIDEO
                                    media_url = att["video_data"].get("url")
                                elif "image_data" in att:
                                    msg_type = MessageTypeEnum.IMAGE
                                    media_url = att["image_data"].get("url")
                                elif "file_url" in att:
                                    file_url = att.get("file_url", "")
                                    mime = (att.get("mime_type") or "").lower()
                                    if "video" in mime or file_url.endswith((".mp4", ".mov", ".avi", ".mkv")):
                                        msg_type = MessageTypeEnum.VIDEO
                                    elif "audio" in mime or any(file_url.endswith(ext) for ext in [".mp3", ".m4a", ".aac", ".wav", ".ogg"]):
                                        msg_type = MessageTypeEnum.AUDIO
                                    elif "image" in mime or any(file_url.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]):
                                        msg_type = MessageTypeEnum.IMAGE
                                    media_url = file_url

                                await self._persist_messenger_msg(
                                    session=session,
                                    conversation_id=conversation.id,
                                    mid=sub_mid,
                                    is_page=is_page,
                                    sender_id=sender_id or sender_name,
                                    text=text if idx == 0 else "",
                                    message_type=msg_type,
                                    media_url=media_url,
                                    created_dt=created_dt,
                                    metadata={
                                        "from_name": sender_name,
                                        "media_url": media_url,
                                        "attachment": att,
                                        "attachments": attachments,
                                    },
                                )

                    await session.commit()
                    msg_url = paging.get("next")
                    msg_params = None
                    await asyncio.sleep(0.2)

                except Exception as e:
                    logger.error("[Messenger Hydration Error] Thread %s: %s", thread_id, e)
                    break

    async def _persist_messenger_msg(
        self,
        session,
        conversation_id,
        mid,
        is_page,
        sender_id,
        text,
        message_type,
        media_url,
        created_dt,
        metadata,
    ):
        existing = (
            await session.execute(select(Message).where(Message.external_message_id == mid))
        ).scalars().first()

        if not existing:
            new_msg = Message(
                id=uuid4(),
                conversation_id=conversation_id,
                external_message_id=mid,
                sender_type=SenderTypeEnum.AGENT if is_page else SenderTypeEnum.CUSTOMER,
                sender_external_id=sender_id,
                text=text or "",
                message_type=message_type,
                created_at=created_dt,
                metadata_={
                    "media_url": media_url,
                    **metadata,
                },
            )
            session.add(new_msg)
        else:
            existing.text = text or existing.text
            existing.message_type = message_type
            existing.metadata_ = {
                **(existing.metadata_ or {}),
                "media_url": media_url,
                **metadata,
            }

        loc = CountryDetector.extract_country(text)
        if loc:
            conv_res = await session.get(Conversation, conversation_id)
            if conv_res and conv_res.customer_id:
                cust_res = await session.get(Customer, conv_res.customer_id)
                if cust_res:
                    cust_res.location = loc
                    session.add(cust_res)

