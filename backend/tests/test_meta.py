import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import httpx
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token
from app.integrations.meta import MetaAPIError, MetaClient, MetaProvider
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


@pytest.mark.asyncio
async def test_meta_client_subscribe_page_success():
    client = MetaClient(page_id="123456789", access_token="test_token_xyz")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_error = False
    mock_resp.json.return_value = {"success": True}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        result = await client.subscribe_page_to_app()

        assert result["success"] is True
        assert result["details"] == {"success": True}
        assert result["error"] is None

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        assert "123456789/subscribed_apps" in mock_post.call_args[0][0]
        assert call_kwargs["params"]["access_token"] == "test_token_xyz"
        assert "messages" in call_kwargs["params"]["subscribed_fields"]
        assert "feed" in call_kwargs["params"]["subscribed_fields"]


@pytest.mark.asyncio
async def test_meta_client_subscribe_page_custom_fields():
    client = MetaClient(page_id="page_custom_1", access_token="tok_custom_1")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_error = False
    mock_resp.json.return_value = {"success": True}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        result = await client.subscribe_page_to_app(
            page_id="page_override",
            access_token="tok_override",
            subscribed_fields=["messages", "feed"],
        )

        assert result["success"] is True
        mock_post.assert_called_once()
        assert "page_override/subscribed_apps" in mock_post.call_args[0][0]
        assert mock_post.call_args.kwargs["params"]["subscribed_fields"] == "messages,feed"
        assert mock_post.call_args.kwargs["params"]["access_token"] == "tok_override"


@pytest.mark.asyncio
async def test_meta_client_subscribe_missing_token_or_page():
    # Missing token
    client_no_token = MetaClient(page_id="123456789", access_token="")
    res1 = await client_no_token.subscribe_page_to_app()
    assert res1["success"] is False
    assert "access_token" in res1["error"].lower()

    # Missing page ID
    client_no_page = MetaClient(page_id="", access_token="some_token")
    res2 = await client_no_page.subscribe_page_to_app()
    assert res2["success"] is False
    assert "page_id" in res2["error"].lower()


@pytest.mark.asyncio
async def test_meta_client_subscribe_api_error():
    client = MetaClient(page_id="123456789", access_token="secret_token_12345")

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.is_error = True
    mock_resp.json.return_value = {
        "error": {
            "message": "Invalid OAuth access token secret_token_12345",
            "type": "OAuthException",
            "code": 190,
        }
    }
    mock_resp.text = "OAuth Error"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        result = await client.subscribe_page_to_app()

        assert result["success"] is False
        assert "Meta API Error (400)" in result["error"]
        # Ensure token is sanitized and never leaked
        assert "secret_token_12345" not in result["error"]
        assert "[REDACTED_TOKEN]" in result["error"]


@pytest.mark.asyncio
async def test_meta_client_subscribe_timeout():
    client = MetaClient(page_id="123456789", access_token="test_token")

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.TimeoutException("Connection timed out")

        result = await client.subscribe_page_to_app()

        assert result["success"] is False
        assert "timed out" in result["error"].lower()


@pytest.mark.asyncio
async def test_meta_client_subscribe_network_error():
    client = MetaClient(page_id="123456789", access_token="test_token")

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.ConnectError("Connection refused")

        result = await client.subscribe_page_to_app()

        assert result["success"] is False
        assert "connection error" in result["error"].lower()


@pytest.mark.asyncio
async def test_meta_provider_subscribe_page_delegation():
    mock_client = MagicMock()
    mock_client.subscribe_page_to_app = AsyncMock(
        return_value={"success": True, "details": {"success": True}, "error": None}
    )

    provider = MetaProvider(client=mock_client)
    res = await provider.subscribe_page_to_app(page_id="page_999")

    assert res["success"] is True
    mock_client.subscribe_page_to_app.assert_awaited_once_with(
        page_id="page_999",
        access_token=None,
        subscribed_fields=None,
    )


@pytest.mark.asyncio
async def test_api_subscribe_page_unauthenticated():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        res = await client.post("/api/v1/meta/subscribe-page")
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_api_subscribe_page_non_admin_forbidden():
    async with AsyncSessionLocal() as session:
        # Create an agent user (non-admin)
        agent = User(
            email="agent_test@luxira.com",
            password_hash="hash",
            full_name="Agent User",
            role=UserRole.AGENT,
            is_active=True,
        )
        session.add(agent)
        await session.commit()
        await session.refresh(agent)

        token = create_access_token(subject=str(agent.id))

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        res = await client.post(
            "/api/v1/meta/subscribe-page",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_api_subscribe_page_admin_success():
    async with AsyncSessionLocal() as session:
        admin = User(
            email="admin_subscribe@luxira.com",
            password_hash="hash",
            full_name="Admin User",
            role=UserRole.ADMIN,
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

        token = create_access_token(subject=str(admin.id))

    with patch(
        "app.integrations.meta.MetaClient.subscribe_page_to_app",
        new_callable=AsyncMock,
    ) as mock_sub:
        mock_sub.return_value = {
            "success": True,
            "details": {"success": True},
            "error": None,
        }

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            res = await client.post(
                "/api/v1/meta/subscribe-page",
                headers={"Authorization": f"Bearer {token}"},
                json={"page_id": "1302055352987458"},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True
            assert data["status"] == "subscribed"
            assert data["page_id"] == "1302055352987458"
            assert "messages" in data["subscribed_fields"]


@pytest.mark.asyncio
async def test_api_subscribe_page_admin_failure_handled():
    async with AsyncSessionLocal() as session:
        admin = User(
            email="admin_fail@luxira.com",
            password_hash="hash",
            full_name="Admin Fail User",
            role=UserRole.ADMIN,
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

        token = create_access_token(subject=str(admin.id))

    with patch(
        "app.integrations.meta.MetaClient.subscribe_page_to_app",
        new_callable=AsyncMock,
    ) as mock_sub:
        mock_sub.return_value = {
            "success": False,
            "details": {"error": {"code": 190}},
            "error": "Meta API Error (400): Invalid token [REDACTED_TOKEN]",
        }

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            res = await client.post(
                "/api/v1/meta/subscribe-page",
                headers={"Authorization": f"Bearer {token}"},
                json={},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is False
            assert data["status"] == "failed"
            assert "Meta API Error" in data["error"]


@pytest.mark.asyncio
async def test_startup_lifespan_auto_subscribe_non_blocking():
    from app.main import lifespan
    from fastapi import FastAPI

    test_app = FastAPI()

    # Test 1: When credentials present, subscribe_page_to_app is called
    with patch(
        "app.integrations.meta.MetaClient.subscribe_page_to_app",
        new_callable=AsyncMock,
    ) as mock_sub:
        mock_sub.return_value = {"success": True, "details": {"success": True}, "error": None}

        async with lifespan(test_app):
            # Allow background tasks to run
            await asyncio.sleep(0.1)

        mock_sub.assert_awaited()

    # Test 2: When credentials cause exception, lifespan starts and exits cleanly without crashing
    with patch(
        "app.integrations.meta.MetaClient.subscribe_page_to_app",
        new_callable=AsyncMock,
    ) as mock_sub_err:
        mock_sub_err.side_effect = RuntimeError("Network totally unreachable")

        async with lifespan(test_app):
            await asyncio.sleep(0.1)

        mock_sub_err.assert_awaited()

