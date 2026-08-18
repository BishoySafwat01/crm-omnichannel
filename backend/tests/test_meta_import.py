from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.database import AsyncSessionLocal
from app.integrations.meta import (
    MetaAPIError,
    MetaClient,
    MetaNormalizer,
    MetaProvider,
)
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
from app.services.meta_import_service import MetaImportService


@pytest.mark.asyncio
async def test_meta_client_missing_token_raises_error():
    client = MetaClient(access_token="")
    with pytest.raises(MetaAPIError) as exc_info:
        await client.get_page_info()
    assert exc_info.value.status_code == 401
    assert "META_PAGE_ACCESS_TOKEN is missing" in exc_info.value.message


@pytest.mark.asyncio
async def test_meta_client_sanitizes_token_in_errors():
    token = "SECRET_META_TOKEN_12345"
    client = MetaClient(access_token=token, page_id="1302055352987458")

    mock_response = MagicMock()
    mock_response.is_error = True
    mock_response.status_code = 400
    mock_response.json.return_value = {
        "error": {"message": f"Invalid OAuth access token {token}"}
    }

    with patch("httpx.AsyncClient.request", AsyncMock(return_value=mock_response)):
        with pytest.raises(MetaAPIError) as exc_info:
            await client.get_page_info()
        assert token not in exc_info.value.message
        assert "[REDACTED_TOKEN]" in exc_info.value.message


def test_meta_normalizer_conversation_and_message():
    page_id = "1302055352987458"
    raw_conv = {
        "id": "t_1368342205478597",
        "updated_time": "2026-08-15T12:00:00+0000",
        "link": "https://facebook.com/messages/t_1368342205478597",
        "participants": {
            "data": [
                {"id": "27703955502560791", "name": "Alice Customer"},
                {"id": "1302055352987458", "name": "Demo Business CRM"},
            ]
        },
    }

    norm_conv = MetaNormalizer.normalize_conversation(raw_conv, page_id=page_id)
    assert norm_conv.external_conversation_id == "t_1368342205478597"
    assert norm_conv.customer_external_user_id == "27703955502560791"
    assert norm_conv.customer_display_name == "Alice Customer"
    assert norm_conv.provider == ProviderEnum.META
    assert norm_conv.channel == ChannelEnum.MESSENGER

    raw_msg = {
        "id": "m_QMU8wDxO4lcsBciEBD-_1",
        "created_time": "2026-08-15T12:01:00+0000",
        "from": {"id": "27703955502560791", "name": "Alice Customer"},
        "message": "Hello Meta Support!",
    }

    norm_msg = MetaNormalizer.normalize_message(raw_msg, page_id=page_id)
    assert norm_msg.external_message_id == "m_QMU8wDxO4lcsBciEBD-_1"
    assert norm_msg.sender_type == SenderTypeEnum.CUSTOMER
    assert norm_msg.sender_external_id == "27703955502560791"
    assert norm_msg.text == "Hello Meta Support!"
    assert norm_msg.message_type == MessageTypeEnum.TEXT


@pytest.mark.asyncio
async def test_meta_provider_pagination():
    mock_client = MagicMock()
    mock_client.page_id = "1302055352987458"
    mock_client.get_conversations = AsyncMock(
        side_effect=[
            {
                "data": [
                    {
                        "id": "t_111",
                        "updated_time": "2026-08-15T10:00:00+0000",
                        "participants": {"data": [{"id": "user_1"}]},
                    }
                ],
                "paging": {
                    "cursors": {"after": "cursor_next_page"},
                    "next": "https://graph.facebook.com/v19.0/...",
                },
            },
            {
                "data": [
                    {
                        "id": "t_222",
                        "updated_time": "2026-08-15T11:00:00+0000",
                        "participants": {"data": [{"id": "user_2"}]},
                    }
                ],
                "paging": {},
            },
        ]
    )

    provider = MetaProvider(client=mock_client)
    conversations = await provider.get_all_conversations(page_id="1302055352987458")

    assert len(conversations) == 2
    assert conversations[0].external_conversation_id == "t_111"
    assert conversations[1].external_conversation_id == "t_222"
    assert mock_client.get_conversations.call_count == 2


@pytest.mark.asyncio
async def test_meta_import_service_full_flow():
    mock_provider = MagicMock()
    mock_provider.validate_configuration = AsyncMock(
        return_value={
            "valid": True,
            "page_id": "1302055352987458",
            "page_name": "Demo Business CRM",
        }
    )

    raw_conv = {
        "id": "t_mock_100",
        "updated_time": "2026-08-15T12:00:00+0000",
        "participants": {
            "data": [
                {"id": "cust_mock_999", "name": "Mock Customer"},
                {"id": "1302055352987458", "name": "Demo Business CRM"},
            ]
        },
    }
    norm_conv = MetaNormalizer.normalize_conversation(
        raw_conv, page_id="1302055352987458"
    )
    mock_provider.get_all_conversations = AsyncMock(return_value=[norm_conv])

    raw_msg1 = {
        "id": "m_mock_001",
        "created_time": "2026-08-15T12:01:00+0000",
        "from": {"id": "cust_mock_999", "name": "Mock Customer"},
        "message": "First mock message",
    }
    raw_msg2 = {
        "id": "m_mock_002",
        "created_time": "2026-08-15T12:02:00+0000",
        "from": {"id": "1302055352987458", "name": "Demo Business CRM"},
        "message": "Agent reply message",
    }
    norm_msg1 = MetaNormalizer.normalize_message(
        raw_msg1, page_id="1302055352987458"
    )
    norm_msg2 = MetaNormalizer.normalize_message(
        raw_msg2, page_id="1302055352987458"
    )
    mock_provider.get_all_messages = AsyncMock(return_value=[norm_msg1, norm_msg2])

    # Run Import 1st time
    async with AsyncSessionLocal() as session:
        job = await MetaImportService.run_import(
            session=session,
            page_id="1302055352987458",
            channel=ChannelEnum.MESSENGER,
            provider_adapter=mock_provider,
        )
        assert job.status == MigrationStatusEnum.COMPLETED
        assert job.processed_conversations == 1
        assert job.processed_messages == 2

    # Verify database state after 1st import
    async with AsyncSessionLocal() as session:
        cust_res = await session.execute(
            select(CustomerIdentity).where(
                CustomerIdentity.external_user_id == "cust_mock_999"
            )
        )
        ident = cust_res.scalar_one()
        assert ident.provider == ProviderEnum.META

        conv_res = await session.execute(
            select(Conversation).where(
                Conversation.external_conversation_id == "t_mock_100"
            )
        )
        conv = conv_res.scalar_one()
        assert conv.channel == ChannelEnum.MESSENGER

        msg_res = await session.execute(
            select(Message).where(Message.conversation_id == conv.id)
        )
        messages = list(msg_res.scalars().all())
        assert len(messages) == 2

    # Run Import 2nd time (IDEMPOTENCY TEST: must not duplicate records)
    async with AsyncSessionLocal() as session:
        job2 = await MetaImportService.run_import(
            session=session,
            page_id="1302055352987458",
            channel=ChannelEnum.MESSENGER,
            provider_adapter=mock_provider,
        )
        assert job2.status == MigrationStatusEnum.COMPLETED

    # Verify counts remain identical (no duplicates)
    async with AsyncSessionLocal() as session:
        cust_count = (
            await session.execute(select(CustomerIdentity))
        ).scalars().all()
        conv_count = (await session.execute(select(Conversation))).scalars().all()
        msg_count = (await session.execute(select(Message))).scalars().all()

        assert len(cust_count) == 1
        assert len(conv_count) == 1
        assert len(msg_count) == 2


@pytest.mark.asyncio
async def test_message_database_uniqueness_constraint():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Test Customer")
        session.add(cust)
        await session.commit()

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_uniq_test",
        )
        session.add(conv)
        await session.commit()

        msg1 = Message(
            conversation_id=conv.id,
            external_message_id="m_dup_123",
            sender_type=SenderTypeEnum.CUSTOMER,
            message_type=MessageTypeEnum.TEXT,
            text="First message",
        )
        session.add(msg1)
        await session.commit()

        msg2 = Message(
            conversation_id=conv.id,
            external_message_id="m_dup_123",
            sender_type=SenderTypeEnum.CUSTOMER,
            message_type=MessageTypeEnum.TEXT,
            text="Duplicate message",
        )
        session.add(msg2)
        with pytest.raises(IntegrityError):
            await session.commit()


def test_attachment_normalization():
    page_id = "1302055352987458"
    raw_image_msg = {
        "id": "m_img_001",
        "created_time": "2026-08-15T12:00:00+0000",
        "from": {"id": "user_100", "name": "Image User"},
        "attachments": {
            "data": [
                {
                    "id": "att_img_123",
                    "type": "image",
                    "name": "photo.jpg",
                    "payload": {
                        "url": "https://scontent.facebook.com/photo.jpg",
                        "mime_type": "image/jpeg",
                    },
                }
            ]
        },
    }

    norm_msg = MetaNormalizer.normalize_message(raw_image_msg, page_id=page_id)
    assert norm_msg.message_type == MessageTypeEnum.IMAGE
    atts = norm_msg.metadata_["attachments"]
    assert len(atts) == 1
    assert atts[0]["type"] == "image"
    assert atts[0]["url"] == "https://scontent.facebook.com/photo.jpg"
    assert atts[0]["title"] == "photo.jpg"


def test_message_type_normalization():
    page_id = "1302055352987458"

    video_msg = MetaNormalizer.normalize_message(
        {
            "id": "m_vid",
            "from": {"id": "u1"},
            "attachments": {"data": [{"type": "video"}]},
        },
        page_id,
    )
    assert video_msg.message_type == MessageTypeEnum.VIDEO

    audio_msg = MetaNormalizer.normalize_message(
        {
            "id": "m_aud",
            "from": {"id": "u1"},
            "attachments": {"data": [{"type": "audio"}]},
        },
        page_id,
    )
    assert audio_msg.message_type == MessageTypeEnum.AUDIO

    file_msg = MetaNormalizer.normalize_message(
        {
            "id": "m_file",
            "from": {"id": "u1"},
            "attachments": {"data": [{"type": "file"}]},
        },
        page_id,
    )
    assert file_msg.message_type == MessageTypeEnum.FILE

    unknown_msg = MetaNormalizer.normalize_message(
        {
            "id": "m_unk",
            "from": {"id": "u1"},
            "attachments": {"data": [{"type": "custom_unknown"}]},
        },
        page_id,
    )
    assert unknown_msg.message_type == MessageTypeEnum.UNKNOWN


def test_sender_type_normalization():
    page_id = "1302055352987458"

    cust_msg = MetaNormalizer.normalize_message(
        {"id": "1", "from": {"id": "customer_999"}}, page_id
    )
    assert cust_msg.sender_type == SenderTypeEnum.CUSTOMER

    agent_msg = MetaNormalizer.normalize_message(
        {"id": "2", "from": {"id": page_id}}, page_id
    )
    assert agent_msg.sender_type == SenderTypeEnum.AGENT

    sys_msg = MetaNormalizer.normalize_message(
        {"id": "3", "from": {"id": "system"}, "is_system": True}, page_id
    )
    assert sys_msg.sender_type == SenderTypeEnum.SYSTEM


def test_timestamp_parsing_validation():
    # Valid timestamp
    ts = MetaNormalizer.parse_iso_timestamp("2026-08-15T12:00:00+0000")
    assert ts.year == 2026

    # Invalid timestamp raises ValueError
    with pytest.raises(ValueError):
        MetaNormalizer.parse_iso_timestamp("invalid-date-string")


@pytest.mark.asyncio
async def test_pagination_termination_and_loop_protection():
    mock_client = MagicMock()
    mock_client.page_id = "1302055352987458"
    mock_client.get_conversations = AsyncMock(
        return_value={
            "data": [{"id": "t_same", "updated_time": "2026-08-15T10:00:00+0000"}],
            "paging": {
                "cursors": {"after": "same_cursor_loop"},
                "next": "https://graph.facebook.com/v19.0/...",
            },
        }
    )

    provider = MetaProvider(client=mock_client)
    conversations = await provider.get_all_conversations(
        page_id="1302055352987458", max_pages=10
    )

    assert len(conversations) == 1
    assert mock_client.get_conversations.call_count == 2


@pytest.mark.asyncio
async def test_partial_failure_handling():
    mock_provider = MagicMock()
    mock_provider.validate_configuration = AsyncMock(
        return_value={"valid": True, "page_id": "1302055352987458"}
    )

    conv1 = MetaNormalizer.normalize_conversation(
        {
            "id": "t_good_1",
            "updated_time": "2026-08-15T12:00:00+0000",
            "participants": {"data": [{"id": "c1"}]},
        },
        page_id="1302055352987458",
    )
    conv2 = MetaNormalizer.normalize_conversation(
        {
            "id": "t_bad_2",
            "updated_time": "2026-08-15T12:00:00+0000",
            "participants": {"data": [{"id": "c2"}]},
        },
        page_id="1302055352987458",
    )
    mock_provider.get_all_conversations = AsyncMock(return_value=[conv1, conv2])

    def mock_get_messages(conversation_id):
        if conversation_id == "t_bad_2":
            raise MetaAPIError("Failed to fetch messages for conversation t_bad_2")
        return [
            MetaNormalizer.normalize_message(
                {"id": "m1", "from": {"id": "c1"}}, page_id="1302055352987458"
            )
        ]

    mock_provider.get_all_messages = AsyncMock(side_effect=mock_get_messages)

    async with AsyncSessionLocal() as session:
        job = await MetaImportService.run_import(
            session=session,
            page_id="1302055352987458",
            channel=ChannelEnum.MESSENGER,
            provider_adapter=mock_provider,
        )

        assert job.status == MigrationStatusEnum.COMPLETED_WITH_ERRORS
        assert job.processed_conversations == 1
        assert job.failed_items == 1
        assert len(job.error_log) == 1
        assert "t_bad_2" in job.error_log[0]["conversation_id"]


def test_token_redaction_in_error_logs():
    token = "EAAG_SECRET_TEST_TOKEN_XYZ"
    with patch("app.services.meta_import_service.settings.META_PAGE_ACCESS_TOKEN", token):
        sanitized = MetaImportService._sanitize_error(
            f"Error calling Meta API with token {token} on endpoint"
        )
        assert token not in sanitized
        assert "[REDACTED_TOKEN]" in sanitized
