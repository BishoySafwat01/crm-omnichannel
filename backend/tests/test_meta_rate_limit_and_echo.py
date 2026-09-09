from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.integrations.meta import MetaAPIError, MetaClient, MetaNormalizer, MetaRateLimitGuard
from app.models import (
    ChannelEnum,
    Conversation,
    Customer,
    CustomerIdentity,
    Message,
    MessageTypeEnum,
    ProviderEnum,
    SenderTypeEnum,
)
from app.services.meta_import_service import MetaImportService


@pytest.fixture(autouse=True)
def reset_guard():
    MetaRateLimitGuard.reset_cooldown()
    MetaRateLimitGuard._failed_psids_cache.clear()
    yield
    MetaRateLimitGuard.reset_cooldown()
    MetaRateLimitGuard._failed_psids_cache.clear()


# ==========================================
# 1. MetaRateLimitGuard Unit Tests
# ==========================================


def test_guard_initial_state():
    assert not MetaRateLimitGuard.is_rate_limited()
    assert MetaRateLimitGuard.get_cooldown_remaining() == 0.0


def test_guard_manual_cooldown():
    MetaRateLimitGuard.trigger_cooldown("Manual Test", cooldown_seconds=60)
    assert MetaRateLimitGuard.is_rate_limited()
    assert MetaRateLimitGuard.get_cooldown_remaining() > 0.0


def test_guard_inspect_http_429():
    req = httpx.Request("GET", "https://graph.facebook.com/v23.0/me")
    resp = httpx.Response(status_code=429, text="Too Many Requests", request=req)
    MetaRateLimitGuard.inspect_response(resp)
    assert MetaRateLimitGuard.is_rate_limited()


def test_guard_inspect_oauth_error_4():
    req = httpx.Request("GET", "https://graph.facebook.com/v23.0/me/conversations")
    error_body = {
        "error": {
            "message": "(#4) Application request limit reached",
            "type": "OAuthException",
            "code": 4,
            "fbtrace_id": "trace_123",
        }
    }
    resp = httpx.Response(status_code=400, json=error_body, request=req)
    MetaRateLimitGuard.inspect_response(resp)
    assert MetaRateLimitGuard.is_rate_limited()


def test_guard_inspect_oauth_error_17_and_32_and_613():
    req = httpx.Request("GET", "https://graph.facebook.com/v23.0/me")
    for code in (17, 32, 613):
        MetaRateLimitGuard.reset_cooldown()
        resp = httpx.Response(
            status_code=400,
            json={"error": {"code": code, "message": "Throttled"}},
            request=req,
        )
        MetaRateLimitGuard.inspect_response(resp)
        assert MetaRateLimitGuard.is_rate_limited()


def test_guard_inspect_usage_header_threshold():
    req = httpx.Request("GET", "https://graph.facebook.com/v23.0/me")
    headers = {"x-page-usage": '{"call_count": 96, "total_cputime": 40, "total_time": 30}'}
    resp = httpx.Response(status_code=200, headers=headers, json={"data": []}, request=req)
    MetaRateLimitGuard.inspect_response(resp)
    assert MetaRateLimitGuard.is_rate_limited()


def test_guard_negative_caching():
    test_psid = "invalid_psid_9999"
    assert not MetaRateLimitGuard.is_psid_failed_recently(test_psid)
    MetaRateLimitGuard.record_failed_psid(test_psid, ttl_seconds=60)
    assert MetaRateLimitGuard.is_psid_failed_recently(test_psid)


@pytest.mark.asyncio
async def test_meta_client_circuit_breaker():
    client = MetaClient(page_id="123", access_token="test_token")
    MetaRateLimitGuard.trigger_cooldown("Rate limited", cooldown_seconds=120)

    with pytest.raises(MetaAPIError) as exc_info:
        await client.get_page_info()
    assert exc_info.value.status_code == 429
    assert "Rate limit cooldown active" in exc_info.value.message


# ==========================================
# 2. Profile Enrichment Guard Tests
# ==========================================


@pytest.mark.asyncio
async def test_fetch_profile_skips_when_rate_limited():
    MetaRateLimitGuard.trigger_cooldown("Rate limited", cooldown_seconds=120)
    with patch("httpx.AsyncClient.get") as mock_get:
        res = await MetaImportService.fetch_and_cache_customer_profile("123456789")
        assert res == {}
        mock_get.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_profile_skips_known_page_ids():
    page_id = settings.META_PAGE_ID or "1302055352987458"
    with patch("httpx.AsyncClient.get") as mock_get:
        res = await MetaImportService.fetch_and_cache_customer_profile(page_id)
        assert res == {}
        mock_get.assert_not_called()


# ==========================================
# 3. Webhook Echo & Self-Message Loop Guard
# ==========================================


@pytest.mark.asyncio
async def test_webhook_echo_does_not_create_customer_for_page():
    import uuid

    page_id = settings.META_PAGE_ID or "1302055352987458"
    rand_suffix = uuid.uuid4().hex[:8]
    cust_psid = f"psid_cust_echo_{rand_suffix}"
    echo_mid = f"mid_echo_{rand_suffix}"

    echo_payload = {
        "object": "page",
        "entry": [
            {
                "id": page_id,
                "messaging": [
                    {
                        "sender": {"id": page_id},
                        "recipient": {"id": cust_psid},
                        "timestamp": 1712345678900,
                        "message": {
                            "mid": echo_mid,
                            "is_echo": True,
                            "text": "Outbound reply from agent",
                        },
                    }
                ],
            }
        ],
    }

    async with AsyncSessionLocal() as session:
        # Pre-seed customer and conversation for recipient
        customer = Customer(display_name="Recipient Customer")
        session.add(customer)
        await session.flush()

        identity = CustomerIdentity(
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id=cust_psid,
        )
        session.add(identity)
        await session.flush()

        conv = Conversation(
            customer_id=customer.id,
            external_conversation_id=f"conv_echo_{rand_suffix}",
            channel=ChannelEnum.MESSENGER,
            provider=ProviderEnum.META,
        )
        session.add(conv)
        await session.flush()

        # Seed outbound agent message
        agent_msg = Message(
            conversation_id=conv.id,
            sender_type=SenderTypeEnum.AGENT,
            text="Outbound reply from agent",
            message_type=MessageTypeEnum.TEXT,
        )
        session.add(agent_msg)
        await session.commit()

        # Process webhook
        result = await MetaImportService.process_inbound_webhook(session, echo_payload)
        assert result["status"] == "already_processed"

        # Verify NO customer was created with external_user_id == page_id
        page_ident = (
            await session.execute(
                select(CustomerIdentity).where(CustomerIdentity.external_user_id == page_id)
            )
        ).scalar_one_or_none()
        assert page_ident is None

        # Verify agent message was linked to echo MID
        refreshed_msg = await session.get(Message, agent_msg.id)
        assert refreshed_msg.external_message_id == echo_mid


# ==========================================
# 4. Live Poller Rate Limit Guard Tests
# ==========================================


@pytest.mark.asyncio
async def test_sync_live_conversations_skips_when_rate_limited():
    MetaRateLimitGuard.trigger_cooldown("Rate limited", cooldown_seconds=300)
    with patch("httpx.AsyncClient.get") as mock_get:
        await MetaImportService.sync_live_conversations()
        mock_get.assert_not_called()


# ==========================================
# 5. Native Echoes & Reels/Shares Attachments
# ==========================================


@pytest.mark.asyncio
async def test_webhook_native_echo_persists_agent_reply_and_broadcasts():
    import uuid

    page_id = settings.META_PAGE_ID or "1302055352987458"
    rand_suffix = uuid.uuid4().hex[:8]
    cust_psid = f"psid_native_echo_{rand_suffix}"
    echo_mid = f"mid_native_echo_{rand_suffix}"

    echo_payload = {
        "object": "page",
        "entry": [
            {
                "id": page_id,
                "messaging": [
                    {
                        "sender": {"id": page_id},
                        "recipient": {"id": cust_psid},
                        "timestamp": 1712345678900,
                        "message": {
                            "mid": echo_mid,
                            "is_echo": True,
                            "text": "Native reply from Instagram mobile app",
                        },
                    }
                ],
            }
        ],
    }

    with patch("app.api.v1.ws.broadcast_realtime_event", new_callable=AsyncMock) as mock_broadcast:
        async with AsyncSessionLocal() as session:
            # Note: No pre-existing agent message!
            result = await MetaImportService.process_inbound_webhook(session, echo_payload)
            assert result["status"] == "success"

            # 1. Verify NO customer was created with page_id
            page_ident = (
                await session.execute(
                    select(CustomerIdentity).where(CustomerIdentity.external_user_id == page_id)
                )
            ).scalar_one_or_none()
            assert page_ident is None

            # 2. Verify customer was created for cust_psid
            cust_ident = (
                await session.execute(
                    select(CustomerIdentity).where(CustomerIdentity.external_user_id == cust_psid)
                )
            ).scalar_one_or_none()
            assert cust_ident is not None

            # 3. Verify message was created with sender_type=AGENT, direction=OUTBOUND
            msg = (
                await session.execute(
                    select(Message).where(Message.external_message_id == echo_mid)
                )
            ).scalar_one_or_none()
            assert msg is not None
            assert msg.sender_type == SenderTypeEnum.AGENT
            assert msg.text == "Native reply from Instagram mobile app"
            assert msg.metadata_.get("direction") == "OUTBOUND"
            assert msg.metadata_.get("is_from_customer") is False
            assert msg.metadata_.get("is_echo") is True

            # 4. Verify realtime WS broadcast was triggered
            mock_broadcast.assert_called_once()
            call_args = mock_broadcast.call_args[1]
            assert call_args["target"] == "conversation"
            assert call_args["payload"]["type"] == "NEW_MESSAGE"
            assert call_args["payload"]["message"]["sender_type"] == "agent"


def test_normalize_webhook_event_reels_and_shares():
    # 1. Instagram Reel Attachment
    reel_item = {
        "sender": {"id": "111222333"},
        "recipient": {"id": "444555666"},
        "timestamp": 1712345678000,
        "message": {
            "mid": "mid_reel_123",
            "attachments": [
                {
                    "type": "ig_reel",
                    "payload": {
                        "reel_video_url": "https://instagram.com/reel/xyz123",
                        "title": "Watch this Reel",
                    },
                }
            ],
        },
    }
    norm_reel = MetaNormalizer.normalize_webhook_event(reel_item, page_id="444555666")
    assert norm_reel.message_type == MessageTypeEnum.VIDEO
    assert norm_reel.text == "[Instagram Reel/Share: https://instagram.com/reel/xyz123]"
    assert norm_reel.attachments[0]["url"] == "https://instagram.com/reel/xyz123"

    # 2. Shares Array
    share_item = {
        "sender": {"id": "111222333"},
        "recipient": {"id": "444555666"},
        "timestamp": 1712345678000,
        "message": {
            "mid": "mid_share_123",
            "shares": [
                {
                    "link": "https://instagram.com/p/abc456",
                    "id": "share_id_789",
                }
            ],
        },
    }
    norm_share = MetaNormalizer.normalize_webhook_event(share_item, page_id="444555666")
    assert norm_share.message_type == MessageTypeEnum.VIDEO
    assert norm_share.text == "[Instagram Reel/Share: https://instagram.com/p/abc456]"
    assert norm_share.attachments[0]["url"] == "https://instagram.com/p/abc456"

