import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import httpx

from app.api.v1.ws import ConnectionManager, broadcast_realtime_event
from app.integrations.beon.client import BeonClient, BeonAPIError


@pytest.mark.asyncio
async def test_connection_manager_brand_access_rules():
    cm = ConnectionManager()

    admin_ws = AsyncMock()
    superadmin_ws = AsyncMock()
    lavva_agent_ws = AsyncMock()
    all_agent_ws = AsyncMock()
    multi_agent_ws = AsyncMock()

    await cm.connect(admin_ws, user_id="admin-1", role="admin", brand_access=["LAVVA"])
    await cm.connect(superadmin_ws, user_id="super-1", role="superadmin", brand_access=[])
    await cm.connect(lavva_agent_ws, user_id="agent-1", role="agent", brand_access=["LAVVA"])
    await cm.connect(all_agent_ws, user_id="agent-2", role="agent", brand_access=["ALL"])
    await cm.connect(multi_agent_ws, user_id="agent-3", role="agent", brand_access=["LAVVA", "FLARE"])

    # Admin and Superadmin must access any brand
    assert cm.has_brand_access(admin_ws, "LAVVA") is True
    assert cm.has_brand_access(admin_ws, "FLARE") is True
    assert cm.has_brand_access(admin_ws, "RANDOM_BRAND") is True
    assert cm.has_brand_access(superadmin_ws, "FLARE") is True

    # Agent with ALL brand access
    assert cm.has_brand_access(all_agent_ws, "LAVVA") is True
    assert cm.has_brand_access(all_agent_ws, "FLARE") is True

    # Agent with only LAVVA
    assert cm.has_brand_access(lavva_agent_ws, "LAVVA") is True
    assert cm.has_brand_access(lavva_agent_ws, "lavva") is True  # case-insensitive
    assert cm.has_brand_access(lavva_agent_ws, "FLARE") is False
    assert cm.has_brand_access(lavva_agent_ws, "UNKNOWN") is False

    # Agent with LAVVA and FLARE
    assert cm.has_brand_access(multi_agent_ws, "LAVVA") is True
    assert cm.has_brand_access(multi_agent_ws, "FLARE") is True
    assert cm.has_brand_access(multi_agent_ws, "OTHER") is False

    # Event with no brand specified should be accessible to all
    assert cm.has_brand_access(lavva_agent_ws, None) is True
    assert cm.has_brand_access(lavva_agent_ws, "") is True


def test_extract_brand_from_payload():
    cm = ConnectionManager()

    assert cm._extract_brand_from_payload({"brand": "FLARE"}) == "FLARE"
    assert cm._extract_brand_from_payload({"conversation": {"brand": "LAVVA"}}) == "LAVVA"
    assert cm._extract_brand_from_payload({"data": {"brand": "BRAND_X"}}) == "BRAND_X"
    assert cm._extract_brand_from_payload({"data": {"conversation": {"brand": "BRAND_Y"}}}) == "BRAND_Y"
    assert cm._extract_brand_from_payload({"message": {"brand": "BRAND_Z"}}) == "BRAND_Z"
    assert cm._extract_brand_from_payload({"payload": {"brand": "BRAND_W"}}) == "BRAND_W"
    assert cm._extract_brand_from_payload({"type": "PING"}) is None


@pytest.mark.asyncio
async def test_broadcast_brand_isolation():
    cm = ConnectionManager()

    ws_lavva = AsyncMock()
    ws_flare = AsyncMock()
    ws_admin = AsyncMock()

    await cm.connect(ws_lavva, user_id="u1", role="agent", brand_access=["LAVVA"])
    await cm.connect(ws_flare, user_id="u2", role="agent", brand_access=["FLARE"])
    await cm.connect(ws_admin, user_id="u3", role="admin", brand_access=[])

    # Broadcast event for brand FLARE
    flare_event = {
        "type": "NEW_MESSAGE",
        "brand": "FLARE",
        "conversation_id": "conv-1",
        "message": {"text": "Hello Flare"},
    }
    await cm.broadcast(flare_event)

    # ws_flare and ws_admin should receive it; ws_lavva must NOT
    ws_flare.send_json.assert_awaited_once_with(flare_event)
    ws_admin.send_json.assert_awaited_once_with(flare_event)
    ws_lavva.send_json.assert_not_awaited()

    # Reset mocks and broadcast event for brand LAVVA
    ws_flare.reset_mock()
    ws_admin.reset_mock()
    ws_lavva.reset_mock()

    lavva_event = {
        "type": "NEW_MESSAGE",
        "brand": "LAVVA",
        "conversation_id": "conv-2",
        "message": {"text": "Hello Lavva"},
    }
    await cm.broadcast(lavva_event)

    # ws_lavva and ws_admin should receive it; ws_flare must NOT
    ws_lavva.send_json.assert_awaited_once_with(lavva_event)
    ws_admin.send_json.assert_awaited_once_with(lavva_event)
    ws_flare.send_json.assert_not_awaited()


@pytest.mark.asyncio
async def test_beon_client_429_backoff_retry():
    client = BeonClient(api_key="test_api_key", base_url="https://api.testbeon.com")

    resp_429 = MagicMock(spec=httpx.Response)
    resp_429.status_code = 429
    resp_429.headers = {"Retry-After": "0"}

    resp_200 = MagicMock(spec=httpx.Response)
    resp_200.status_code = 200
    resp_200.json.return_value = {"status": 200, "data": {"id": 123}}

    with patch("httpx.AsyncClient.request", side_effect=[resp_429, resp_429, resp_200]) as mock_request:
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            result = await client._request("GET", "/test/path", max_retries=3, base_delay=0.01)
            assert result == {"status": 200, "data": {"id": 123}}
            assert mock_request.call_count == 3
            assert mock_sleep.call_count == 2


@pytest.mark.asyncio
async def test_beon_client_500_backoff_exhaustion():
    client = BeonClient(api_key="test_api_key", base_url="https://api.testbeon.com")

    resp_500 = MagicMock(spec=httpx.Response)
    resp_500.status_code = 500
    resp_500.text = "Internal Server Error"
    resp_500.headers = {}
    resp_500.json.side_effect = Exception("Not JSON")

    with patch("httpx.AsyncClient.request", return_value=resp_500) as mock_request:
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            with pytest.raises(BeonAPIError) as exc_info:
                await client._request("GET", "/test/path", max_retries=3, base_delay=0.01)
            assert exc_info.value.status_code == 500
            assert mock_request.call_count == 3
            assert mock_sleep.call_count == 2


@pytest.mark.asyncio
async def test_verify_user_conversation_access():
    import uuid
    from app.api.v1.ws import _verify_user_conversation_access
    from app.models.enums import UserRole

    # Mock Admin User
    admin_user = MagicMock()
    admin_user.id = uuid.uuid4()
    admin_user.role = UserRole.ADMIN
    admin_user.is_active = True
    conv_id = str(uuid.uuid4())

    # Admin is always allowed without hitting DB
    assert await _verify_user_conversation_access(admin_user, conv_id) is True

    # Inactive user is always denied
    inactive_user = MagicMock()
    inactive_user.is_active = False
    assert await _verify_user_conversation_access(inactive_user, conv_id) is False

    # None user is denied
    assert await _verify_user_conversation_access(None, conv_id) is False
