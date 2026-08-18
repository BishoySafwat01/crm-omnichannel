import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.integrations.respond_io import (
    RespondIoAPIError,
    RespondIoClient,
    RespondIoNormalizer,
    RespondIoProvider,
)
from app.main import app
from app.models import (
    ChannelEnum,
    Conversation,
    Customer,
    CustomerIdentity,
    Message,
    MessageTypeEnum,
    MigrationJob,
    MigrationStatusEnum,
    ProviderEnum,
    SenderTypeEnum,
)
from app.services.message_service import MessageService
from app.services.respond_io_import_service import RespondIoImportService


@pytest.mark.asyncio
async def test_respond_io_client_missing_token():
    client = RespondIoClient(api_token="")
    with pytest.raises(RespondIoAPIError) as exc_info:
        await client.get_workspace_info()
    assert exc_info.value.status_code == 401
    assert "RESPOND_IO_API_TOKEN is missing" in exc_info.value.message


@pytest.mark.asyncio
async def test_respond_io_client_successful_auth_and_request():
    token = "test_respond_io_token_123"
    client = RespondIoClient(api_token=token)

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = '{"code":400,"message":"Invalid id identifer"}'

    with patch("httpx.AsyncClient.post", AsyncMock(return_value=mock_resp)):
        res = await client.get_workspace_info()
        assert res["valid"] is True
        assert res["provider"] == "respond_io"


@pytest.mark.asyncio
async def test_respond_io_client_error_handling_and_token_redaction():
    token = "SECRET_RESPOND_IO_TOKEN_999"
    client = RespondIoClient(api_token=token)

    # 401 Auth Failure
    mock_401 = MagicMock()
    mock_401.status_code = 401
    mock_401.text = f"Invalid token {token}"
    mock_401.json.return_value = {"message": f"Invalid token {token}"}

    with patch("httpx.AsyncClient.post", AsyncMock(return_value=mock_401)):
        with pytest.raises(RespondIoAPIError) as exc_info:
            await client.get_workspace_info()
        assert exc_info.value.status_code == 401
        assert token not in exc_info.value.message
        assert "[REDACTED_TOKEN]" in exc_info.value.message

    # 403 Permission Failure
    mock_403 = MagicMock()
    mock_403.is_error = True
    mock_403.status_code = 403
    mock_403.json.return_value = {"message": "Forbidden access"}

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_403)):
        with pytest.raises(RespondIoAPIError) as exc_info:
            await client.get_contact("c_forbidden")
        assert exc_info.value.status_code == 403

    # 404 Response
    mock_404 = MagicMock()
    mock_404.is_error = True
    mock_404.status_code = 404
    mock_404.json.return_value = {"message": "Contact not found"}

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_404)):
        with pytest.raises(RespondIoAPIError) as exc_info:
            await client.get_contact("c_missing")
        assert exc_info.value.status_code == 404

    # 429 Rate Limit Response with Retry-After
    mock_429 = MagicMock()
    mock_429.is_error = True
    mock_429.status_code = 429
    mock_429.headers = {"Retry-After": "10"}
    mock_429.json.return_value = {"message": "Too Many Requests"}

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_429)):
        with pytest.raises(RespondIoAPIError) as exc_info:
            await client.get_contact("c_ratelimit")
        assert exc_info.value.status_code == 429
        assert "Retry after 10s" in exc_info.value.message

    # 500 Provider Error
    mock_500 = MagicMock()
    mock_500.is_error = True
    mock_500.status_code = 500
    mock_500.json.return_value = {"message": "Internal Server Error"}

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_500)):
        with pytest.raises(RespondIoAPIError) as exc_info:
            await client.get_contact("c_500")
        assert exc_info.value.status_code == 500


def test_respond_io_normalizer_contact_and_message():
    raw_contact = {
        "id": "c_1001",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890",
        "channel": "whatsapp",
    }
    norm_c = RespondIoNormalizer.normalize_contact(raw_contact)
    assert norm_c.external_user_id == "c_1001"
    assert norm_c.display_name == "John Doe"
    assert norm_c.provider == ProviderEnum.RESPOND_IO
    assert norm_c.channel == ChannelEnum.WHATSAPP

    # Message normalization
    raw_msg = {
        "messageId": "msg_respond_777",
        "type": "text",
        "senderType": "user",
        "text": "Hello agent!",
    }
    norm_m = RespondIoNormalizer.normalize_message(raw_msg)
    assert norm_m.external_message_id == "msg_respond_777"
    assert norm_m.sender_type == SenderTypeEnum.AGENT
    assert norm_m.message_type == MessageTypeEnum.TEXT
    assert norm_m.text == "Hello agent!"


@pytest.mark.asyncio
async def test_respond_io_provider_outbound_send():
    mock_client = MagicMock()
    mock_client.send_message = AsyncMock(
        return_value={"messageId": "msg_resp_out_555", "status": "success"}
    )
    provider = RespondIoProvider(client=mock_client)

    res = await provider.send_outbound_message(
        recipient_external_id="c_1001", text="Outbound text via provider"
    )
    assert res["external_message_id"] == "msg_resp_out_555"
    assert res["recipient_id"] == "c_1001"


@pytest.mark.asyncio
async def test_successful_respond_io_outbound_message_persisted():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Respond.io Customer")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_user_id="c_whatsapp_user_888",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id="conv_resp_wa_1",
        )
        session.add(conv)
        await session.commit()
        old_last_message_at = conv.last_message_at

        mock_provider = MagicMock()
        mock_provider.send_outbound_message = AsyncMock(
            return_value={
                "external_message_id": "msg_resp_db_111",
                "recipient_id": "c_whatsapp_user_888",
                "raw": {"messageId": "msg_resp_db_111"},
            }
        )

        msg = await MessageService.send_agent_reply(
            session=session,
            conversation_id=conv.id,
            text="Hello WhatsApp Customer via Respond.io!",
            provider_adapter=mock_provider,
        )

        assert msg.external_message_id == "msg_resp_db_111"
        assert msg.sender_type == SenderTypeEnum.AGENT
        assert msg.text == "Hello WhatsApp Customer via Respond.io!"

        # Verify DB persistence
        db_msg = (
            await session.execute(select(Message).where(Message.id == msg.id))
        ).scalar_one()
        assert db_msg.sender_type == SenderTypeEnum.AGENT

        db_conv = (
            await session.execute(
                select(Conversation).where(Conversation.id == conv.id)
            )
        ).scalar_one()
        assert db_conv.last_message_at > old_last_message_at


@pytest.mark.asyncio
async def test_failed_respond_io_outbound_send_no_db_record():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Fail Respond.io Cust")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_user_id="c_fail_user_999",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id="conv_resp_fail_1",
        )
        session.add(conv)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.send_outbound_message = AsyncMock(
            side_effect=RespondIoAPIError("Respond.io 401 Unauthorized")
        )

        with pytest.raises(RespondIoAPIError):
            await MessageService.send_agent_reply(
                session=session,
                conversation_id=conv.id,
                text="This message will fail to send",
                provider_adapter=mock_provider,
            )

        # Verify no Message created in database
        msgs = (
            await session.execute(
                select(Message).where(Message.conversation_id == conv.id)
            )
        ).scalars().all()
        assert len(msgs) == 0


@pytest.mark.asyncio
async def test_duplicate_external_message_protection_respond_io():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Dup Respond.io Cust")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_user_id="c_dup_user_777",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id="conv_resp_dup_1",
        )
        session.add(conv)
        await session.commit()

        mock_provider = MagicMock()
        mock_provider.send_outbound_message = AsyncMock(
            return_value={
                "external_message_id": "msg_resp_dup_ext_id",
                "recipient_id": "c_dup_user_777",
                "raw": {},
            }
        )

        msg1 = await MessageService.send_agent_reply(
            session=session,
            conversation_id=conv.id,
            text="First send",
            provider_adapter=mock_provider,
        )

        msg2 = await MessageService.send_agent_reply(
            session=session,
            conversation_id=conv.id,
            text="First send",
            provider_adapter=mock_provider,
        )

        assert msg1.id == msg2.id

        msgs = (
            await session.execute(
                select(Message).where(Message.conversation_id == conv.id)
            )
        ).scalars().all()
        assert len(msgs) == 1


# ==================================================
# PHASE 5.2 RESPOND.IO CONTACT IMPORT TESTS
# ==================================================


@pytest.mark.asyncio
async def test_respond_io_import_service_full_flow():
    mock_provider = MagicMock()
    mock_provider.validate_configuration = AsyncMock(
        return_value={"valid": True, "provider": "respond_io"}
    )

    norm_c1 = RespondIoNormalizer.normalize_contact(
        {
            "id": "c_mock_501",
            "firstName": "Alice",
            "lastName": "Smith",
            "phone": "+1999888777",
            "email": "alice.smith@example.com",
            "channel": "whatsapp",
        }
    )
    norm_c2 = RespondIoNormalizer.normalize_contact(
        {
            "id": "c_mock_502",
            "firstName": "Bob",
            "lastName": "Jones",
            "phone": "+1222333444",
            "email": "bob.jones@example.com",
            "channel": "whatsapp",
        }
    )

    mock_provider.get_all_contacts = AsyncMock(return_value=[norm_c1, norm_c2])

    async with AsyncSessionLocal() as session:
        job = await RespondIoImportService.run_import(
            session=session,
            channel=ChannelEnum.WHATSAPP,
            provider_adapter=mock_provider,
        )

        assert job.status == MigrationStatusEnum.COMPLETED
        assert job.processed_conversations == 2

        # Verify DB persistence of Customers & CustomerIdentities
        stmt_c = select(CustomerIdentity).where(
            CustomerIdentity.provider == ProviderEnum.RESPOND_IO,
            CustomerIdentity.external_user_id.in_(["c_mock_501", "c_mock_502"]),
        )
        idents = (await session.execute(stmt_c)).scalars().all()
        assert len(idents) == 2


@pytest.mark.asyncio
async def test_respond_io_import_service_idempotency():
    mock_provider = MagicMock()
    mock_provider.validate_configuration = AsyncMock(
        return_value={"valid": True, "provider": "respond_io"}
    )

    norm_c = RespondIoNormalizer.normalize_contact(
        {
            "id": "c_mock_idempotent_1",
            "firstName": "Idempotent",
            "lastName": "User",
            "phone": "+1000000000",
            "channel": "whatsapp",
        }
    )
    mock_provider.get_all_contacts = AsyncMock(return_value=[norm_c])

    async with AsyncSessionLocal() as session:
        # Run 1st import
        job1 = await RespondIoImportService.run_import(
            session=session,
            channel=ChannelEnum.WHATSAPP,
            provider_adapter=mock_provider,
        )
        assert job1.status == MigrationStatusEnum.COMPLETED

        # Count customers and identities
        cnt1_cust = (
            await session.execute(
                select(Customer).where(Customer.display_name == "Idempotent User")
            )
        ).scalars().all()
        assert len(cnt1_cust) == 1

        # Run 2nd import
        job2 = await RespondIoImportService.run_import(
            session=session,
            channel=ChannelEnum.WHATSAPP,
            provider_adapter=mock_provider,
        )
        assert job2.status == MigrationStatusEnum.COMPLETED

        # Verify counts remained identical
        cnt2_cust = (
            await session.execute(
                select(Customer).where(Customer.display_name == "Idempotent User")
            )
        ).scalars().all()
        assert len(cnt2_cust) == 1

        cnt2_ident = (
            await session.execute(
                select(CustomerIdentity).where(
                    CustomerIdentity.provider == ProviderEnum.RESPOND_IO,
                    CustomerIdentity.external_user_id == "c_mock_idempotent_1",
                )
            )
        ).scalars().all()
        assert len(cnt2_ident) == 1


@pytest.mark.asyncio
async def test_respond_io_import_endpoint_api():
    mock_provider = MagicMock()
    mock_provider.validate_configuration = AsyncMock(
        return_value={"valid": True, "provider": "respond_io"}
    )
    norm_c = RespondIoNormalizer.normalize_contact(
        {
            "id": "c_mock_endpoint_1",
            "firstName": "API",
            "lastName": "Test",
            "channel": "whatsapp",
        }
    )
    mock_provider.get_all_contacts = AsyncMock(return_value=[norm_c])

    with patch(
        "app.services.respond_io_import_service.RespondIoProvider",
        return_value=mock_provider,
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            res = await client.post("/api/v1/respond-io/import")
            assert res.status_code == 200
            data = res.json()
            assert data["provider"] == "respond_io"
            assert data["status"] == "completed"
            assert data["processed_conversations"] == 1


# ==================================================
# PHASE 5.4 & 5.5 RESPOND.IO INBOUND WEBHOOK TESTS
# ==================================================


@pytest.mark.asyncio
async def test_respond_io_inbound_webhook_valid_event():
    payload = {
        "event": "message.created",
        "contact": {
            "id": "c_inbound_901",
            "firstName": "Inbound",
            "lastName": "Customer",
            "phone": "+1555444333",
            "email": "inbound@example.com",
            "channel": "whatsapp",
        },
        "message": {
            "messageId": "msg_inbound_ext_888",
            "type": "text",
            "text": "Hello CRM, this is an inbound customer message!",
            "direction": "inbound",
            "senderType": "customer",
            "createdAt": "2026-08-17T01:38:00Z",
        },
    }

    async with AsyncSessionLocal() as session:
        res = await RespondIoImportService.process_inbound_webhook(
            session=session,
            raw_payload=payload,
        )

        assert res["status"] == "success"
        assert res["external_message_id"] == "msg_inbound_ext_888"

        # Verify DB persistence
        db_msg = (
            await session.execute(
                select(Message).where(
                    Message.external_message_id == "msg_inbound_ext_888"
                )
            )
        ).scalar_one()

        assert db_msg.sender_type == SenderTypeEnum.CUSTOMER
        assert db_msg.text == "Hello CRM, this is an inbound customer message!"


@pytest.mark.asyncio
async def test_respond_io_inbound_webhook_idempotency():
    payload = {
        "event": "message.created",
        "contact": {
            "id": "c_idempotent_902",
            "firstName": "Repeat",
            "lastName": "Sender",
            "phone": "+1999000111",
            "channel": "whatsapp",
        },
        "message": {
            "messageId": "msg_repeat_ext_999",
            "type": "text",
            "text": "Repeat message delivery",
            "direction": "inbound",
            "createdAt": "2026-08-17T01:38:00Z",
        },
    }

    async with AsyncSessionLocal() as session:
        # Deliver 1st time
        res1 = await RespondIoImportService.process_inbound_webhook(
            session=session,
            raw_payload=payload,
        )
        assert res1["status"] == "success"

        # Deliver 2nd time (Duplicate payload)
        res2 = await RespondIoImportService.process_inbound_webhook(
            session=session,
            raw_payload=payload,
        )
        assert res2["status"] == "already_processed"
        assert res2["external_message_id"] == "msg_repeat_ext_999"

        # Verify count in database is 1
        msgs = (
            await session.execute(
                select(Message).where(
                    Message.external_message_id == "msg_repeat_ext_999"
                )
            )
        ).scalars().all()
        assert len(msgs) == 1


@pytest.mark.asyncio
async def test_respond_io_webhook_endpoint_authentication():
    payload = {
        "contact": {"id": "c_auth_test_1"},
        "message": {
            "messageId": "msg_auth_1",
            "type": "text",
            "text": "Secret test",
        },
    }

    with patch.object(settings, "RESPOND_IO_WEBHOOK_SECRET", "super_secret_webhook_key"):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            # 1. Reject invalid secret header
            res_bad = await client.post(
                "/api/v1/respond-io/webhook",
                headers={"x-respond-secret": "wrong_secret"},
                json=payload,
            )
            assert res_bad.status_code == 401

            # 2. Accept valid secret header
            res_good = await client.post(
                "/api/v1/respond-io/webhook",
                headers={"x-respond-secret": "super_secret_webhook_key"},
                json=payload,
            )
            assert res_good.status_code == 200
            assert res_good.json()["status"] == "success"


@pytest.mark.asyncio
async def test_respond_io_webhook_validation_and_malformed_payloads():
    with patch.object(settings, "RESPOND_IO_WEBHOOK_SECRET", "test_secret"):
        headers = {"x-webhook-secret": "test_secret"}
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            # 1. Invalid JSON body
            res_invalid_json = await client.post(
                "/api/v1/respond-io/webhook",
                headers=headers,
                content="not_valid_json",
            )
            assert res_invalid_json.status_code == 400

            # 2. Missing contact_id
            res_missing_contact = await client.post(
                "/api/v1/respond-io/webhook",
                headers=headers,
                json={"event": "message.created", "message": {"text": "No contact ID"}},
            )
            assert res_missing_contact.status_code == 400
            assert "Missing contact identifier" in res_missing_contact.json()["detail"]


@pytest.mark.asyncio
async def test_respond_io_webhook_non_message_events():
    payload = {
        "event": "contact.updated",
        "contact": {
            "id": "c_non_msg_1",
            "firstName": "NonMessage",
            "lastName": "Event",
        },
    }
    async with AsyncSessionLocal() as session:
        res = await RespondIoImportService.process_inbound_webhook(
            session=session, raw_payload=payload
        )
        assert res["status"] == "processed"
        assert res["message"] == "Ignored non-message event."

        # Verify no Message record created
        conv_stmt = select(Conversation).where(
            Conversation.external_conversation_id == "resp_conv_c_non_msg_1"
        )
        conv = (await session.execute(conv_stmt)).scalar_one_or_none()
        assert conv is not None

        msg_stmt = select(Message).where(Message.conversation_id == conv.id)
        msgs = (await session.execute(msg_stmt)).scalars().all()
        assert len(msgs) == 0


@pytest.mark.asyncio
async def test_respond_io_webhook_attachments_normalization():
    payload = {
        "event": "message.created",
        "contact": {"id": "c_attachment_user_1", "name": "Attachment User"},
        "message": {
            "messageId": "msg_attachment_100",
            "type": "image",
            "text": "Check out this picture",
            "attachments": [
                {
                    "id": "att_1",
                    "type": "image",
                    "url": "https://example.com/image.jpg",
                }
            ],
            "direction": "inbound",
        },
    }
    async with AsyncSessionLocal() as session:
        res = await RespondIoImportService.process_inbound_webhook(
            session=session, raw_payload=payload
        )
        assert res["status"] == "success"

        db_msg = (
            await session.execute(
                select(Message).where(
                    Message.external_message_id == "msg_attachment_100"
                )
            )
        ).scalar_one()
        assert db_msg.message_type == MessageTypeEnum.IMAGE
        assert len(db_msg.metadata_["attachments"]) == 1
        assert db_msg.metadata_["attachments"][0]["url"] == "https://example.com/image.jpg"


@pytest.mark.asyncio
async def test_respond_io_webhook_out_of_order_events():
    payload_later = {
        "event": "message.created",
        "contact": {"id": "c_ooo_user_1", "name": "Out of Order User"},
        "message": {
            "messageId": "msg_ooo_later_2",
            "type": "text",
            "text": "Second message arriving first",
            "direction": "inbound",
            "createdAt": "2026-08-17T02:00:00Z",
        },
    }
    payload_earlier = {
        "event": "message.created",
        "contact": {"id": "c_ooo_user_1", "name": "Out of Order User"},
        "message": {
            "messageId": "msg_ooo_earlier_1",
            "type": "text",
            "text": "First message arriving second",
            "direction": "inbound",
            "createdAt": "2026-08-17T01:00:00Z",
        },
    }

    async with AsyncSessionLocal() as session:
        # 1. Process later message first
        res2 = await RespondIoImportService.process_inbound_webhook(
            session=session, raw_payload=payload_later
        )
        assert res2["status"] == "success"

        conv_stmt = select(Conversation).where(
            Conversation.external_conversation_id == "resp_conv_c_ooo_user_1"
        )
        conv = (await session.execute(conv_stmt)).scalar_one()
        later_ts = conv.last_message_at

        # 2. Process earlier message second
        res1 = await RespondIoImportService.process_inbound_webhook(
            session=session, raw_payload=payload_earlier
        )
        assert res1["status"] == "success"

        await session.refresh(conv)
        # Verify last_message_at did NOT move backwards
        assert conv.last_message_at == later_ts

        # Verify both messages persisted
        msgs = (
            await session.execute(
                select(Message).where(Message.conversation_id == conv.id)
            )
        ).scalars().all()
        assert len(msgs) == 2
