import asyncio
from unittest.mock import ANY, AsyncMock, MagicMock, patch
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
        assert "messaging_postbacks" in call_kwargs["params"]["subscribed_fields"]
        assert "message_echoes" in call_kwargs["params"]["subscribed_fields"]
        assert "standby" in call_kwargs["params"]["subscribed_fields"]


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
    with (
        patch.object(settings, "META_PAGE_ACCESS_TOKEN", "mock_page_token"),
        patch.object(settings, "META_PAGE_ID", "mock_page_id"),
        patch(
            "app.integrations.meta.MetaClient.subscribe_page_to_app",
            new_callable=AsyncMock,
        ) as mock_sub,
    ):
        mock_sub.return_value = {"success": True, "details": {"success": True}, "error": None}

        async with lifespan(test_app):
            # Allow background tasks to run
            await asyncio.sleep(0.1)

        mock_sub.assert_awaited()

    # Test 2: When credentials cause exception, lifespan starts and exits cleanly without crashing
    with (
        patch.object(settings, "META_PAGE_ACCESS_TOKEN", "mock_page_token"),
        patch.object(settings, "META_PAGE_ID", "mock_page_id"),
        patch(
            "app.integrations.meta.MetaClient.subscribe_page_to_app",
            new_callable=AsyncMock,
        ) as mock_sub_err,
    ):
        mock_sub_err.side_effect = RuntimeError("Network totally unreachable")

        async with lifespan(test_app):
            await asyncio.sleep(0.1)

        mock_sub_err.assert_awaited()


def test_meta_oauth_sanitized_scopes():
    from app.services.meta_oauth_service import MetaOAuthService, VALID_SCOPES, DEFAULT_SCOPES

    expected_canonical_scopes = [
        "pages_show_list",
        "pages_messaging",
        "pages_read_engagement",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_manage_messages",
        "instagram_manage_comments",
        "public_profile",
    ]
    assert VALID_SCOPES == expected_canonical_scopes
    assert DEFAULT_SCOPES == expected_canonical_scopes

    # Ensure unapproved/deprecated scopes are completely absent
    for disallowed in (
        "pages_manage_posts",
        "pages_read_user_content",
    ):
        assert disallowed not in VALID_SCOPES

    with patch.object(settings, "META_APP_ID", "1234567890"):
        url = MetaOAuthService.get_authorization_url(state="test_state_123")
        assert "client_id=1234567890" in url
        assert "state=test_state_123" in url
        assert "auth_type=rerequest" in url
        assert "public_profile" in url
        assert "pages_show_list" in url
        assert "pages_messaging" in url
        assert "pages_read_engagement" in url
        assert "pages_manage_metadata" in url
        assert "instagram_manage_messages" in url
        assert "instagram_basic" in url
        assert "instagram_manage_comments" in url


def test_generate_oauth_state_with_redirect_uri():
    import uuid
    from app.services.meta_oauth_service import MetaOAuthService

    test_uid = uuid.uuid4()
    redirect_uri = "https://custom.domain/api/v1/meta/oauth/callback"
    state = MetaOAuthService.generate_oauth_state(user_id=test_uid, redirect_uri=redirect_uri)

    payload = MetaOAuthService.verify_oauth_state(state=state)
    assert payload["sub"] == str(test_uid)
    assert payload["redirect_uri"] == redirect_uri


@pytest.mark.asyncio
async def test_meta_oauth_server_callback_error():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/meta/oauth/callback?error=access_denied&error_description=User%20denied%20permissions")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
        content = resp.text
        assert "META_OAUTH_COMPLETE" in content
        assert "status: 'error'" in content
        assert "User denied permissions" in content
        assert "window.close()" in content


@pytest.mark.asyncio
async def test_meta_oauth_server_callback_success():
    import uuid
    from app.services.meta_oauth_service import MetaOAuthService

    test_uid = uuid.uuid4()
    state = MetaOAuthService.generate_oauth_state(user_id=test_uid)

    mock_pages = [
        {
            "id": "1122334455",
            "name": "Luxury Test Brand",
            "access_token": "mock_page_token_xyz",
            "category": "Retail",
        }
    ]

    with (
        patch.object(MetaOAuthService, "exchange_code_for_user_token", new_callable=AsyncMock) as mock_exchange,
        patch.object(MetaOAuthService, "fetch_user_pages", new_callable=AsyncMock) as mock_fetch,
        patch.object(MetaOAuthService, "save_or_update_pages", new_callable=AsyncMock) as mock_save,
    ):
        mock_exchange.return_value = "mock_long_lived_token_123"
        mock_fetch.return_value = mock_pages
        mock_save.return_value = []

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/meta/oauth/callback?code=mock_oauth_code_456&state={state}")
            assert resp.status_code == 200
            assert "text/html" in resp.headers.get("content-type", "")
            content = resp.text
            assert "META_OAUTH_COMPLETE" in content
            assert "status: 'success'" in content
            assert "window.close()" in content

        mock_exchange.assert_awaited_once_with(code="mock_oauth_code_456", redirect_uri="https://webluxira.com/api/v1/meta/oauth/callback")
        mock_fetch.assert_awaited_once_with(long_lived_user_token="mock_long_lived_token_123", db=ANY)
        mock_save.assert_awaited_once()


@pytest.mark.asyncio
async def test_meta_client_send_attachment_message_success(tmp_path):
    from app.integrations.meta.client import MetaClient
    import tempfile

    test_file = tmp_path / "test_audio.m4a"
    test_file.write_bytes(b"dummy audio content")

    client = MetaClient(page_id="101509818947526", access_token="test_token")
    client.get_token_for_page = AsyncMock(return_value="test_page_token")

    mock_resp = MagicMock()
    mock_resp.is_error = False
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"recipient_id": "28495192496757118", "message_id": "mid.12345"}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await client.send_attachment_message(
            recipient_id="28495192496757118",
            file_path=str(test_file),
            attachment_type="audio",
            page_id="101509818947526",
            channel="messenger",
        )
        assert res["message_id"] == "mid.12345"
        assert res["recipient_id"] == "28495192496757118"
        mock_post.assert_awaited_once()
        call_kwargs = mock_post.await_args.kwargs
        assert "files" in call_kwargs
        assert "data" in call_kwargs
        assert call_kwargs["data"]["messaging_type"] == "RESPONSE"


@pytest.mark.asyncio
async def test_meta_client_send_attachment_instagram():
    from app.integrations.meta.client import MetaClient

    client = MetaClient(page_id="101509818947526", access_token="test_token")
    client.get_token_for_page = AsyncMock(return_value="test_page_token")

    mock_resp = MagicMock()
    mock_resp.is_error = False
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"recipient_id": "ig_12345", "message_id": "mid.ig_67890"}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        res = await client.send_attachment_message(
            recipient_id="ig_12345",
            file_path="https://webluxira.com/uploads/photo.jpg",
            attachment_type="image",
            channel="instagram",
        )
        assert res["message_id"] == "mid.ig_67890"
        mock_post.assert_awaited_once()
        call_url = mock_post.await_args.args[0]
        assert "/me/messages" in call_url
        call_kwargs = mock_post.await_args.kwargs
        assert "json" in call_kwargs
        assert call_kwargs["json"]["recipient"]["id"] == "12345"


@pytest.mark.asyncio
async def test_meta_provider_send_outbound_attachment(tmp_path):
    from app.integrations.meta.provider import MetaProvider

    test_file = tmp_path / "voice_test.m4a"
    test_file.write_bytes(b"voice data")

    mock_client = MagicMock()
    mock_client.page_id = "101509818947526"
    mock_client.send_attachment_message = AsyncMock(return_value={"message_id": "mid.att999", "recipient_id": "28495192496757118"})

    provider = MetaProvider(client=mock_client)
    res = await provider.send_outbound_attachment(
        recipient_external_id="28495192496757118",
        file_path=str(test_file),
        attachment_type="audio",
        channel="messenger",
    )
    assert res["external_message_id"] == "mid.att999"
    assert res["recipient_id"] == "28495192496757118"
    mock_client.send_attachment_message.assert_awaited_once_with(
        recipient_id="28495192496757118",
        file_path=str(test_file),
        attachment_type="audio",
        page_id="101509818947526",
        tag=None,
        db=None,
        channel="messenger",
    )


@pytest.mark.asyncio
async def test_meta_oauth_get_authorization_url_rerequest():
    from app.services.meta_oauth_service import MetaOAuthService

    url = MetaOAuthService.get_authorization_url(
        state="test_state_123",
        redirect_uri="https://webluxira.com/api/v1/meta/oauth/callback",
    )
    assert "auth_type=rerequest" in url
    assert "client_id=" in url
    assert "state=test_state_123" in url


@pytest.mark.asyncio
async def test_meta_oauth_cache_and_get_admin_user_token():
    from app.services.meta_oauth_service import MetaOAuthService

    # Test in-memory cache directly
    await MetaOAuthService.cache_admin_user_token("EAAtest_token_user_12345")
    retrieved = await MetaOAuthService.get_active_admin_user_token()
    assert retrieved == "EAAtest_token_user_12345"


@pytest.mark.asyncio
async def test_connected_page_refresh_and_discover_fallback():
    from app.services.connected_page_service import ConnectedPageService
    from app.services.meta_oauth_service import MetaOAuthService

    # Clear cached user token
    MetaOAuthService._latest_user_token = None

    mock_session = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_res

    with patch.object(MetaOAuthService, "get_active_admin_user_token", new_callable=AsyncMock) as mock_get_tok:
        mock_get_tok.return_value = None
        report = await ConnectedPageService.refresh_and_discover_pages(session=mock_session)

        assert report["success"] is True
        assert report["needs_reauth"] is True
        assert report["new_pages_count"] == 0
        assert "ربط صفحة فيسبوك جديدة" in report["message"]


@pytest.mark.asyncio
async def test_connected_page_refresh_and_discover_with_token():
    import uuid
    from app.services.connected_page_service import ConnectedPageService
    from app.services.meta_oauth_service import MetaOAuthService
    from app.models.connected_page import ConnectedPage

    mock_session = AsyncMock()
    mock_res = MagicMock()
    # Existing page in DB: Lotus blue cosmetic
    existing_page = ConnectedPage(
        id=uuid.uuid4(),
        page_id="101509818947526",
        name="Lotus blue cosmetic",
        encrypted_access_token="enc_tok_1",
        status="ACTIVE",
        is_webhook_subscribed=True,
    )
    mock_res.scalars.return_value.all.return_value = [existing_page]
    mock_session.execute.return_value = mock_res

    discovered_pages = [
        {"id": "101509818947526", "name": "Lotus blue cosmetic", "access_token": "tok_1"},
        {"id": "100736899432829", "name": "LOOX KING WOMEN", "access_token": "tok_2"},
    ]

    new_page_record = ConnectedPage(
        id=uuid.uuid4(),
        page_id="100736899432829",
        name="LOOX KING WOMEN",
        encrypted_access_token="enc_tok_2",
        status="ACTIVE",
        is_webhook_subscribed=True,
    )

    with patch.object(MetaOAuthService, "get_active_admin_user_token", new_callable=AsyncMock) as mock_get_tok, \
         patch.object(MetaOAuthService, "fetch_user_pages", new_callable=AsyncMock) as mock_fetch, \
         patch.object(MetaOAuthService, "save_or_update_pages", new_callable=AsyncMock) as mock_save:

        mock_get_tok.return_value = "EAA_valid_admin_token"
        mock_fetch.return_value = discovered_pages
        mock_save.return_value = [existing_page, new_page_record]

        report = await ConnectedPageService.refresh_and_discover_pages(
            session=mock_session,
            user_id=uuid.uuid4(),
        )

        assert report["success"] is True
        assert report["needs_reauth"] is False
        assert report["total_pages"] == 2
        assert report["new_pages_count"] == 1
        assert "LOOX KING WOMEN" in report["new_pages"]
        assert "تم اكتشاف وتفعيل 1 صفحة جديدة بنجاح" in report["message"]




