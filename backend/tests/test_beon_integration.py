import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.integrations.base import BaseMessagingProvider
from app.integrations.beon import BeonAPIError, BeonClient, BeonNormalizer, BeonOmnichannelProvider
from app.integrations.factory import ProviderFactory
from app.integrations.meta import MetaProvider
from app.main import app
from app.models.enums import ChannelEnum, ProviderEnum
from app.models.social_comment import SocialComment, CommentModerationLog, CommentModerationSetting


@pytest.mark.asyncio
async def test_beon_live_handshake():
    """Verify live BeOn API handshake with Partner token."""
    client = BeonClient()
    account_info = await client.get_account_details()
    assert account_info is not None
    assert account_info.get("status") == 200
    data = account_info.get("data", {})
    assert data.get("id") == 1995
    assert data.get("account_name") == "Luxira"
    assert "balance" in data


@pytest.mark.asyncio
async def test_beon_conversations_normalization():
    """Verify BeOn conversation fetching and normalization."""
    client = BeonClient()
    res = await client.get_conversations(page=1, per_page=3)
    assert res.get("status") == 200
    records = res.get("data", {}).get("records", [])
    assert len(records) > 0

    sample = records[0]
    norm = BeonNormalizer.normalize_conversation(sample)
    assert norm["external_conversation_id"] == str(sample["id"])
    assert norm["provider"] == ProviderEnum.BEON
    assert "channel" in norm
    assert "customer_name" in norm


@pytest.mark.asyncio
async def test_provider_factory_dynamic_toggle():
    """Verify ProviderFactory resolution for False vs True toggle states."""
    # State 1: ENABLE_DIRECT_META = False -> All channels route to BeOn
    settings.ENABLE_DIRECT_META = False
    p1 = ProviderFactory.get_provider(channel=ChannelEnum.MESSENGER)
    assert isinstance(p1, BeonOmnichannelProvider)
    assert isinstance(p1, BaseMessagingProvider)

    p2 = ProviderFactory.get_provider(channel=ChannelEnum.WHATSAPP)
    assert isinstance(p2, BeonOmnichannelProvider)

    # State 2: ENABLE_DIRECT_META = True -> Hybrid routing
    settings.ENABLE_DIRECT_META = True
    p3 = ProviderFactory.get_provider(channel=ChannelEnum.MESSENGER, page_id="211839025349185")
    assert isinstance(p3, MetaProvider)
    assert isinstance(p3, BaseMessagingProvider)

    p4 = ProviderFactory.get_provider(channel=ChannelEnum.WHATSAPP)
    assert isinstance(p4, BeonOmnichannelProvider)

    # Reset back to default
    settings.ENABLE_DIRECT_META = False


@pytest.mark.asyncio
async def test_social_comments_orm_and_endpoint():
    """Verify SocialComment database schema fix and API query execution."""
    async with AsyncSessionLocal() as session:
        # ORM query must execute without UndefinedColumnError
        comments = (await session.execute(select(SocialComment).limit(5))).scalars().all()
        assert isinstance(comments, list)

        logs = (await session.execute(select(CommentModerationLog).limit(5))).scalars().all()
        assert isinstance(logs, list)

        settings_list = (await session.execute(select(CommentModerationSetting).limit(5))).scalars().all()
        assert isinstance(settings_list, list)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/api/v1/comments")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data


@pytest.mark.asyncio
async def test_beon_status_endpoint():
    """Verify GET /api/v1/beon/status endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/api/v1/beon/status")
        assert r.status_code == 200
        data = r.json()
        assert data.get("provider") == "beon"
        assert data.get("status") == "connected"
        assert data.get("account", {}).get("account_name") == "Luxira"


@pytest.mark.asyncio
async def test_meta_integrations_status_endpoint():
    """Verify GET /api/v1/meta/integrations/status includes BeOn & Provider details."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/api/v1/meta/integrations/status")
        assert r.status_code == 200
        data = r.json()
        assert "direct_meta_enabled" in data
        assert "active_provider" in data
        assert data["beon_connected"] is True
        assert data["meta_pages_count"] >= 5
