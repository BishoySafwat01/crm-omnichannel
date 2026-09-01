from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.integrations.base import BaseMessagingProvider
from app.integrations.meta.client import MetaClient
from app.integrations.meta.normalizer import (
    MetaNormalizer,
    NormalizedConversation,
    NormalizedMessage,
)
from app.models.enums import ChannelEnum


class MetaProvider(BaseMessagingProvider):
    def __init__(self, client: Optional[MetaClient] = None, page_id: Optional[str] = None):
        self.client = client or MetaClient(page_id=page_id)
        self.page_id = page_id or self.client.page_id

    async def validate_credentials(self) -> dict[str, Any]:
        info = await self.client.get_page_info(page_id=self.page_id)
        return {
            "valid": True,
            "provider": "meta",
            "page_id": info.get("id"),
            "page_name": info.get("name"),
            "category": info.get("category"),
        }

    async def validate_configuration(self) -> dict[str, Any]:
        return await self.validate_credentials()

    def normalize_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        return payload

    async def sync_conversations(
        self, limit: int = 50, page: int = 1, **kwargs: Any
    ) -> dict[str, Any]:
        convs = await self.get_all_conversations(page_id=self.page_id, max_pages=page)
        return {"items": convs, "total": len(convs)}

    async def subscribe_page_to_app(
        self,
        page_id: Optional[str] = None,
        access_token: Optional[str] = None,
        subscribed_fields: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Subscribe Facebook Page to app webhooks."""
        return await self.client.subscribe_page_to_app(
            page_id=page_id,
            access_token=access_token,
            subscribed_fields=subscribed_fields,
        )

    async def get_all_conversations(
        self,
        page_id: Optional[str] = None,
        channel: ChannelEnum = ChannelEnum.MESSENGER,
        max_pages: int = 500,
    ) -> list[NormalizedConversation]:
        target_page_id = page_id or self.client.page_id or ""
        conversations: list[NormalizedConversation] = []
        after_cursor: Optional[str] = None
        seen_cursors: set[str] = set()
        page_count = 0

        from urllib.parse import parse_qs, urlparse

        while page_count < max_pages:
            page_count += 1
            res = await self.client.get_conversations(
                page_id=target_page_id, limit=25, after=after_cursor
            )
            raw_list = res.get("data", [])
            paging = res.get("paging", {})
            cursors = paging.get("cursors", {})
            next_cursor = cursors.get("after")

            if not next_cursor and "next" in paging:
                parsed = urlparse(paging["next"])
                params = parse_qs(parsed.query)
                next_cursor = params.get("after", [None])[0]

            if next_cursor and next_cursor in seen_cursors:
                break
            if next_cursor:
                seen_cursors.add(next_cursor)

            for raw_conv in raw_list:
                norm_conv = MetaNormalizer.normalize_conversation(
                    raw_conv, page_id=target_page_id, channel=channel
                )
                conversations.append(norm_conv)

            if not next_cursor or not raw_list or ("next" not in paging and "after" not in cursors):
                break

            after_cursor = next_cursor

        return conversations

    async def get_all_messages(
        self,
        conversation_id: str,
        max_pages: int = 500,
        page_id: Optional[str] = None,
        since_days: Optional[int] = None,
        since_timestamp: Optional[datetime] = None,
    ) -> list[NormalizedMessage]:
        target_page_id = page_id or self.client.page_id or ""
        messages: list[NormalizedMessage] = []
        after_cursor: Optional[str] = None
        seen_cursors: set[str] = set()
        page_count = 0
        from urllib.parse import parse_qs, urlparse

        cutoff_time: Optional[datetime] = None
        if since_timestamp:
            cutoff_time = since_timestamp
        elif since_days is not None and since_days > 0:
            cutoff_time = datetime.now(timezone.utc) - timedelta(days=since_days)

        while page_count < max_pages:
            page_count += 1
            res = await self.client.get_messages(
                conversation_id=conversation_id, limit=50, after=after_cursor, page_id=target_page_id
            )
            raw_list = res.get("data", [])
            paging = res.get("paging", {})
            cursors = paging.get("cursors", {})
            next_cursor = cursors.get("after")

            if not next_cursor and "next" in paging:
                parsed = urlparse(paging["next"])
                params = parse_qs(parsed.query)
                next_cursor = params.get("after", [None])[0]

            if next_cursor and next_cursor in seen_cursors:
                break
            if next_cursor:
                seen_cursors.add(next_cursor)

            hit_cutoff = False
            for raw_msg in raw_list:
                norm_msg = MetaNormalizer.normalize_message(
                    raw_msg, page_id=target_page_id
                )
                if cutoff_time and norm_msg.created_at:
                    msg_time = norm_msg.created_at
                    if msg_time.tzinfo is None:
                        msg_time = msg_time.replace(tzinfo=timezone.utc)
                    if cutoff_time.tzinfo is None:
                        cutoff_time = cutoff_time.replace(tzinfo=timezone.utc)
                    if msg_time < cutoff_time:
                        hit_cutoff = True
                        continue
                messages.append(norm_msg)

            if hit_cutoff:
                break

            if not next_cursor or not raw_list or ("next" not in paging and "after" not in cursors):
                break

            after_cursor = next_cursor

        return messages

    async def send_outbound_message(
        self,
        recipient_external_id: str,
        text: str,
        page_id: Optional[str] = None,
        tag: Optional[str] = "HUMAN_AGENT",
    ) -> dict[str, Any]:
        res = await self.client.send_message(
            recipient_id=recipient_external_id,
            text=text,
            page_id=page_id,
            tag=tag,
        )
        return {
            "external_message_id": res.get("message_id") or res.get("id"),
            "recipient_id": res.get("recipient_id") or recipient_external_id,
            "raw": res,
        }

    async def send_outbound_attachment(
        self,
        recipient_external_id: str,
        file_path: str,
        attachment_type: str = "audio",
        page_id: Optional[str] = None,
        tag: Optional[str] = "HUMAN_AGENT",
    ) -> dict[str, Any]:
        res = await self.client.send_attachment_message(
            recipient_id=recipient_external_id,
            file_path=file_path,
            attachment_type=attachment_type,
            page_id=page_id,
            tag=tag,
        )
        return {
            "external_message_id": res.get("message_id") or res.get("id"),
            "recipient_id": res.get("recipient_id") or recipient_external_id,
            "raw": res,
        }
