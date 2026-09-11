import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.integrations.meta import MetaAPIError, MetaClient, MetaProvider
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
from app.services.message_service import MessageService


@pytest.mark.asyncio
async def test_outbound_empty_and_whitespace_message_rejected():
    async with AsyncSessionLocal() as session:
        conv_id = uuid.uuid4()
        with pytest.raises(ValueError, match="cannot be empty or whitespace"):
            await MessageService.send_agent_reply(
                session=session, conversation_id=conv_id, text=""
            )
        with pytest.raises(ValueError, match="cannot be empty or whitespace"):
            await MessageService.send_agent_reply(
                session=session, conversation_id=conv_id, text="   "
            )


@pytest.mark.asyncio
async def test_outbound_conversation_not_found_rejected():
    async with AsyncSessionLocal() as session:
        fake_id = uuid.uuid4()
        with pytest.raises(ValueError, match="not found"):
            await MessageService.send_agent_reply(
                session=session, conversation_id=fake_id, text="Hello agent reply"
            )


@pytest.mark.asyncio
async def test_outbound_unsupported_provider_and_channel_rejected():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Test Unsupported Cust")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.BEON,
            channel=ChannelEnum.TIKTOK,
            external_user_id="tiktok_123",
        )
        session.add(ident)

        # Test unsupported channel (e.g. BEON + TIKTOK)
        conv_tiktok = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.BEON,
            channel=ChannelEnum.TIKTOK,
            external_conversation_id="conv_tiktok_123",
        )
        session.add(conv_tiktok)
        await session.commit()

        # Should route or fail gracefully
        with patch(
            "app.integrations.beon.BeonOmnichannelProvider.send_outbound_message",
            new_callable=AsyncMock,
        ) as mock_send:
            mock_send.return_value = {
                "external_message_id": "beon_tiktok_msg_1",
                "recipient_id": "tiktok_123",
                "raw": {"status": 200},
            }
            res = await MessageService.send_agent_reply(
                session=session, conversation_id=conv_tiktok.id, text="Hello TikTok"
            )
            assert res is not None


@pytest.mark.asyncio
async def test_outbound_missing_customer_identity_rejected():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Cust Without Identity")
        session.add(cust)
        await session.commit()

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="conv_no_ident",
        )
        session.add(conv)
        await session.commit()

        with pytest.raises(ValueError, match="identity not found"):
            await MessageService.send_agent_reply(
                session=session, conversation_id=conv.id, text="Hello"
            )


@pytest.mark.asyncio
async def test_meta_client_send_message_success():
    client = MetaClient(access_token="test_token_123", page_id="1302055352987458")
    mock_response = MagicMock()
    mock_response.is_error = False
    mock_response.json.return_value = {
        "recipient_id": "27703955502560791",
        "message_id": "m_outbound_12345",
    }

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_response)):
        res = await client.send_message(
            recipient_id="27703955502560791", text="Hello from Meta Client test"
        )
        assert res["message_id"] == "m_outbound_12345"
        assert res["recipient_id"] == "27703955502560791"


@pytest.mark.asyncio
async def test_meta_client_send_message_auth_permission_network_failures():
    client = MetaClient(access_token="test_token_123", page_id="1302055352987458")

    # 401 Auth Failure
    mock_401 = MagicMock()
    mock_401.is_error = True
    mock_401.status_code = 401
    mock_401.json.return_value = {"error": {"message": "Invalid OAuth token test_token_123"}}

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_401)):
        with pytest.raises(MetaAPIError) as exc_info:
            await client.send_message(recipient_id="r1", text="Test")
        assert exc_info.value.status_code == 401
        assert "test_token_123" not in exc_info.value.message
        assert "[REDACTED_TOKEN]" in exc_info.value.message

    # 403 Permission Failure
    mock_403 = MagicMock()
    mock_403.is_error = True
    mock_403.status_code = 403
    mock_403.json.return_value = {
        "error": {"message": "(#200) This page does not have permission to send messages"}
    }

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_403)):
        with pytest.raises(MetaAPIError) as exc_info:
            await client.send_message(recipient_id="r1", text="Test")
        assert exc_info.value.status_code == 403
        assert "permission" in exc_info.value.message.lower()


@pytest.mark.asyncio
async def test_successful_outbound_message_persisted_and_last_message_at_updated():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Alice Recipient")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="27703955502560791",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id=f"t_outbound_{uuid.uuid4().hex[:8]}",
        )
        session.add(conv)
        await session.commit()

        old_last_message_at = conv.last_message_at

        mock_provider = MagicMock()
        mock_provider.send_outbound_message = AsyncMock(
            return_value={
                "external_message_id": "m_outbound_success_999",
                "recipient_id": "27703955502560791",
                "raw": {"message_id": "m_outbound_success_999"},
            }
        )

        msg = await MessageService.send_agent_reply(
            session=session,
            conversation_id=conv.id,
            text="Hello Alice! This is an agent reply.",
            provider_adapter=mock_provider,
        )

        assert msg.external_message_id == "m_outbound_success_999"
        assert msg.sender_type == SenderTypeEnum.AGENT
        assert msg.text == "Hello Alice! This is an agent reply."
        assert msg.metadata_["recipient_id"] == "27703955502560791"

        # Verify DB persistence
        msg_db = (
            await session.execute(select(Message).where(Message.id == msg.id))
        ).scalar_one()
        assert msg_db.sender_type == SenderTypeEnum.AGENT

        conv_db = (
            await session.execute(
                select(Conversation).where(Conversation.id == conv.id)
            )
        ).scalar_one()
        assert conv_db.last_message_at > old_last_message_at


@pytest.mark.asyncio
async def test_failed_meta_send_does_not_create_message_record():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Fail Recipient")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="user_fail_123",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_fail_conv",
        )
        session.add(conv)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.send_outbound_message = AsyncMock(
            side_effect=MetaAPIError("Meta API error 400: Expired token")
        )

        with pytest.raises(MetaAPIError):
            await MessageService.send_agent_reply(
                session=session,
                conversation_id=conv.id,
                text="This will fail to send",
                provider_adapter=mock_provider,
            )

        # Verify no message created in database
        msgs = (
            await session.execute(
                select(Message).where(Message.conversation_id == conv.id)
            )
        ).scalars().all()
        assert len(msgs) == 0


@pytest.mark.asyncio
async def test_duplicate_external_message_id_does_not_create_duplicate():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Dup Recipient")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="user_dup_123",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_dup_conv",
        )
        session.add(conv)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.send_outbound_message = AsyncMock(
            return_value={
                "external_message_id": "m_existing_ext_id",
                "recipient_id": "user_dup_123",
                "raw": {},
            }
        )

        # Send 1st time
        msg1 = await MessageService.send_agent_reply(
            session=session,
            conversation_id=conv.id,
            text="First send",
            provider_adapter=mock_provider,
        )

        # Send 2nd time returning same external message ID
        msg2 = await MessageService.send_agent_reply(
            session=session,
            conversation_id=conv.id,
            text="First send",
            provider_adapter=mock_provider,
        )

        assert msg1.id == msg2.id

        # Verify count in database is 1
        msgs = (
            await session.execute(
                select(Message).where(Message.conversation_id == conv.id)
            )
        ).scalars().all()
        assert len(msgs) == 1


@pytest.mark.asyncio
async def test_dynamic_page_resolution_from_connected_page_by_brand():
    from app.models.connected_page import ConnectedPage
    from app.core.security import encrypt_token

    async with AsyncSessionLocal() as session:
        # Create ConnectedPage with specific brand
        brand_name = f"Brand_{uuid.uuid4().hex[:6]}"
        test_page_id = f"page_{uuid.uuid4().hex[:8]}"
        cp = ConnectedPage(
            page_id=test_page_id,
            name=brand_name,
            encrypted_access_token=encrypt_token("test_page_access_token_123"),
            status="ACTIVE",
        )
        session.add(cp)
        await session.commit()

        cust = Customer(display_name="Brand Customer")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="psid_98765",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id=f"t_brand_{uuid.uuid4().hex[:8]}",
            brand=brand_name,
        )
        session.add(conv)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.send_outbound_message = AsyncMock(
            return_value={
                "external_message_id": "m_brand_success",
                "recipient_id": "psid_98765",
                "raw": {"message_id": "m_brand_success"},
            }
        )

        msg = await MessageService.send_agent_reply(
            session=session,
            conversation_id=conv.id,
            text="Testing dynamic brand resolution",
            provider_adapter=mock_provider,
        )

        assert msg.external_message_id == "m_brand_success"
        # Assert provider was called with the resolved page_id from ConnectedPage
        mock_provider.send_outbound_message.assert_called_once()
        call_kwargs = mock_provider.send_outbound_message.call_args.kwargs
        assert call_kwargs.get("page_id") == test_page_id
        assert call_kwargs.get("tag") is None


@pytest.mark.asyncio
async def test_meta_client_messaging_type_response_and_unapproved_tag_fallback():
    client = MetaClient(access_token="test_token_456", page_id="1302055352987458")

    # 1. Default send_message should dispatch messaging_type: RESPONSE
    mock_resp_success = MagicMock()
    mock_resp_success.is_error = False
    mock_resp_success.json.return_value = {"message_id": "m_resp_1", "recipient_id": "r1"}

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_resp_success)) as mock_req:
        res = await client.send_message(recipient_id="r1", text="Hello default RESPONSE")
        assert res["message_id"] == "m_resp_1"
        called_json = mock_req.call_args.kwargs.get("json")
        assert called_json["messaging_type"] == "RESPONSE"
        assert "tag" not in called_json

    # 2. Tag send with unapproved tag error (#100) should automatically retry with RESPONSE
    mock_resp_tag_fail = MagicMock()
    mock_resp_tag_fail.is_error = True
    mock_resp_tag_fail.status_code = 400
    mock_resp_tag_fail.json.return_value = {
        "error": {
            "message": "(#100) The parameter messaging_type: MESSAGE_TAG requires tag",
            "type": "OAuthException",
            "code": 100,
        }
    }

    with patch("httpx.AsyncClient.request", AsyncMock(side_effect=[mock_resp_tag_fail, mock_resp_success])) as mock_req_retry:
        res = await client.send_message(recipient_id="r1", text="Hello tag retry", tag="HUMAN_AGENT")
        assert res["message_id"] == "m_resp_1"
        assert mock_req_retry.call_count == 2
        first_payload = mock_req_retry.call_args_list[0].kwargs.get("json")
        second_payload = mock_req_retry.call_args_list[1].kwargs.get("json")
        assert first_payload["messaging_type"] == "MESSAGE_TAG"
        assert first_payload["tag"] == "HUMAN_AGENT"
        assert second_payload["messaging_type"] == "RESPONSE"
        assert "tag" not in second_payload

