from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.integrations.meta import MetaAPIError, MetaClient, MetaRateLimitGuard
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
