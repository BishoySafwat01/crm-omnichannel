import hmac
import hashlib
from unittest.mock import patch
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.main import app
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


@pytest.mark.asyncio
async def test_canonical_webhooks_meta_verification_success():
    with patch.object(settings, "META_WEBHOOK_VERIFY_TOKEN", "my_canonical_verify_secret_123"):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            res = await client.get(
                "/api/webhooks/meta",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "my_canonical_verify_secret_123",
                    "hub.challenge": "canonical_challenge_999",
                },
            )
            assert res.status_code == 200
            assert res.text == "canonical_challenge_999"


@pytest.mark.asyncio
async def test_canonical_webhooks_meta_verification_failures():
    with patch.object(settings, "META_WEBHOOK_VERIFY_TOKEN", "my_canonical_verify_secret_123"):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            # Invalid token
            res_invalid = await client.get(
                "/api/webhooks/meta",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "wrong_token",
                    "hub.challenge": "canonical_challenge_999",
                },
            )
            assert res_invalid.status_code == 403

            # Missing params
            res_missing = await client.get("/api/webhooks/meta")
            assert res_missing.status_code == 400


@pytest.mark.asyncio
async def test_canonical_webhooks_meta_post_signature_and_event():
    payload = {
        "object": "page",
        "entry": [
            {
                "id": settings.META_PAGE_ID or "1302055352987458",
                "messaging": [
                    {
                        "sender": {"id": "psid_canonical_post_1"},
                        "recipient": {"id": settings.META_PAGE_ID or "1302055352987458"},
                        "timestamp": 1712345678901,
                        "message": {"mid": "mid_canonical_post_1", "text": "Canonical POST message"},
                    }
                ],
            }
        ],
    }
    app_secret = "canonical_app_secret_777"

    with patch.object(settings, "META_APP_SECRET", app_secret):
        import json
        raw_body = json.dumps(payload).encode("utf-8")
        valid_sig = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            # Reject wrong signature
            res_bad = await client.post(
                "/api/webhooks/meta",
                headers={"x-hub-signature-256": "sha256=invalid_hex_digest"},
                content=raw_body,
            )
            assert res_bad.status_code == 401

            # Accept valid signature
            res_good = await client.post(
                "/api/webhooks/meta",
                headers={"x-hub-signature-256": valid_sig},
                content=raw_body,
            )
            assert res_good.status_code == 200
            assert res_good.json()["status"] == "success"

            # Verify idempotency on second POST
            res_dup = await client.post(
                "/api/webhooks/meta",
                headers={"x-hub-signature-256": valid_sig},
                content=raw_body,
            )
            assert res_dup.status_code == 200
            assert res_dup.json()["status"] == "already_processed"


@pytest.mark.asyncio
async def test_meta_webhook_verification_success():
    with patch.object(settings, "META_WEBHOOK_VERIFY_TOKEN", "my_verify_secret_123"):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            res = await client.get(
                "/api/v1/meta/webhook",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "my_verify_secret_123",
                    "hub.challenge": "1158201444",
                },
            )
            assert res.status_code == 200
            assert res.text == "1158201444"


@pytest.mark.asyncio
async def test_meta_webhook_verification_failures():
    with patch.object(settings, "META_WEBHOOK_VERIFY_TOKEN", "my_verify_secret_123"):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            # Invalid token
            res_invalid = await client.get(
                "/api/v1/meta/webhook",
                params={
                    "hub.mode": "subscribe",
                    "hub.verify_token": "wrong_token",
                    "hub.challenge": "1158201444",
                },
            )
            assert res_invalid.status_code == 403

            # Missing params
            res_missing = await client.get("/api/v1/meta/webhook")
            assert res_missing.status_code == 400


@pytest.mark.asyncio
async def test_meta_webhook_signature_validation():
    payload = {
        "object": "page",
        "entry": [
            {
                "id": settings.META_PAGE_ID or "1302055352987458",
                "messaging": [
                    {
                        "sender": {"id": "psid_sig_test_1"},
                        "recipient": {"id": settings.META_PAGE_ID or "1302055352987458"},
                        "timestamp": 1712345678901,
                        "message": {"mid": "mid_sig_1", "text": "Sig test message"},
                    }
                ],
            }
        ],
    }
    app_secret = "test_app_secret_999"

    with patch.object(settings, "META_APP_SECRET", app_secret):
        import json
        raw_body = json.dumps(payload).encode("utf-8")
        valid_sig = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            # Reject wrong signature
            res_bad = await client.post(
                "/api/v1/meta/webhook",
                headers={"x-hub-signature-256": "sha256=invalid_hex_digest"},
                content=raw_body,
            )
            assert res_bad.status_code == 401

            # Accept valid signature
            res_good = await client.post(
                "/api/v1/meta/webhook",
                headers={"x-hub-signature-256": valid_sig},
                content=raw_body,
            )
            assert res_good.status_code == 200
            assert res_good.json()["status"] == "success"


@pytest.mark.asyncio
async def test_meta_inbound_webhook_valid_event():
    page_id = settings.META_PAGE_ID or "1302055352987458"
    payload = {
        "object": "page",
        "entry": [
            {
                "id": page_id,
                "messaging": [
                    {
                        "sender": {"id": "psid_cust_701"},
                        "recipient": {"id": page_id},
                        "timestamp": 1712345678000,
                        "message": {
                            "mid": "mid_meta_inbound_701",
                            "text": "Hello Messenger from customer!",
                        },
                    }
                ],
            }
        ],
    }

    async with AsyncSessionLocal() as session:
        res = await MetaImportService.process_inbound_webhook(
            session=session, raw_payload=payload
        )
        assert res["status"] == "success"
        assert res["messages_created"] == 1

        # Verify DB persistence
        db_msg = (
            await session.execute(
                select(Message).where(
                    Message.external_message_id == "mid_meta_inbound_701"
                )
            )
        ).scalar_one()

        assert db_msg.sender_type == SenderTypeEnum.CUSTOMER
        assert db_msg.sender_external_id == "psid_cust_701"
        assert db_msg.text == "Hello Messenger from customer!"

        # Verify Customer & Identity persistence
        db_ident = (
            await session.execute(
                select(CustomerIdentity).where(
                    CustomerIdentity.provider == ProviderEnum.META,
                    CustomerIdentity.channel == ChannelEnum.MESSENGER,
                    CustomerIdentity.external_user_id == "psid_cust_701",
                )
            )
        ).scalar_one()
        assert db_ident is not None


@pytest.mark.asyncio
async def test_meta_inbound_webhook_idempotency():
    page_id = settings.META_PAGE_ID or "1302055352987458"
    payload = {
        "object": "page",
        "entry": [
            {
                "id": page_id,
                "messaging": [
                    {
                        "sender": {"id": "psid_repeat_702"},
                        "recipient": {"id": page_id},
                        "timestamp": 1712345678000,
                        "message": {
                            "mid": "mid_meta_repeat_702",
                            "text": "Repeat Messenger webhook message",
                        },
                    }
                ],
            }
        ],
    }

    async with AsyncSessionLocal() as session:
        # Deliver 1st time
        res1 = await MetaImportService.process_inbound_webhook(
            session=session, raw_payload=payload
        )
        assert res1["status"] == "success"

        # Deliver 2nd time (Duplicate payload)
        res2 = await MetaImportService.process_inbound_webhook(
            session=session, raw_payload=payload
        )
        assert res2["status"] == "already_processed"
        assert res2["messages_created"] == 0

        # Verify 1 record in DB
        msgs = (
            await session.execute(
                select(Message).where(
                    Message.external_message_id == "mid_meta_repeat_702"
                )
            )
        ).scalars().all()
        assert len(msgs) == 1


@pytest.mark.asyncio
async def test_meta_inbound_webhook_attachment_normalization():
    page_id = settings.META_PAGE_ID or "1302055352987458"
    payload = {
        "object": "page",
        "entry": [
            {
                "id": page_id,
                "messaging": [
                    {
                        "sender": {"id": "psid_att_703"},
                        "recipient": {"id": page_id},
                        "timestamp": 1712345678000,
                        "message": {
                            "mid": "mid_meta_att_703",
                            "attachments": [
                                {
                                    "type": "image",
                                    "payload": {
                                        "url": "https://scontent.xx.fbcdn.net/image.jpg",
                                        "title": "Photo attachment",
                                    },
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    async with AsyncSessionLocal() as session:
        res = await MetaImportService.process_inbound_webhook(
            session=session, raw_payload=payload
        )
        assert res["status"] == "success"

        db_msg = (
            await session.execute(
                select(Message).where(
                    Message.external_message_id == "mid_meta_att_703"
                )
            )
        ).scalar_one()
        assert db_msg.message_type == MessageTypeEnum.IMAGE
        assert len(db_msg.metadata_["attachments"]) == 1
        assert db_msg.metadata_["attachments"][0]["url"] == "https://scontent.xx.fbcdn.net/image.jpg"


@pytest.mark.asyncio
async def test_meta_inbound_webhook_out_of_order_events():
    page_id = settings.META_PAGE_ID or "1302055352987458"
    payload_later = {
        "object": "page",
        "entry": [
            {
                "id": page_id,
                "messaging": [
                    {
                        "sender": {"id": "psid_ooo_704"},
                        "recipient": {"id": page_id},
                        "timestamp": 1712350000000,  # Later
                        "message": {
                            "mid": "mid_ooo_later",
                            "text": "Later message",
                        },
                    }
                ],
            }
        ],
    }
    payload_earlier = {
        "object": "page",
        "entry": [
            {
                "id": page_id,
                "messaging": [
                    {
                        "sender": {"id": "psid_ooo_704"},
                        "recipient": {"id": page_id},
                        "timestamp": 1712340000000,  # Earlier
                        "message": {
                            "mid": "mid_ooo_earlier",
                            "text": "Earlier message",
                        },
                    }
                ],
            }
        ],
    }

    async with AsyncSessionLocal() as session:
        # Process later message first
        res2 = await MetaImportService.process_inbound_webhook(
            session=session, raw_payload=payload_later
        )
        assert res2["status"] == "success"

        conv_stmt = select(Conversation).where(
            Conversation.external_conversation_id == "resp_conv_psid_ooo_704"
        )
        conv = (await session.execute(conv_stmt)).scalar_one()
        later_ts = conv.last_message_at

        # Process earlier message second
        res1 = await MetaImportService.process_inbound_webhook(
            session=session, raw_payload=payload_earlier
        )
        assert res1["status"] == "success"

        await session.refresh(conv)
        # Verify last_message_at did NOT move backwards
        assert conv.last_message_at == later_ts


@pytest.mark.asyncio
async def test_meta_inbound_webhook_page_filtering():
    payload_other_page = {
        "object": "page",
        "entry": [
            {
                "id": "999999999999999",  # Different Page ID
                "messaging": [
                    {
                        "sender": {"id": "psid_other_page_user"},
                        "recipient": {"id": "999999999999999"},
                        "timestamp": 1712345678000,
                        "message": {
                            "mid": "mid_other_page_msg",
                            "text": "Ignored message for another page",
                        },
                    }
                ],
            }
        ],
    }

    with patch.object(settings, "META_PAGE_ID", "1302055352987458"):
        async with AsyncSessionLocal() as session:
            res = await MetaImportService.process_inbound_webhook(
                session=session, raw_payload=payload_other_page
            )
            assert res["processed_events"] == 0
            assert res["messages_created"] == 0

            # Verify no Message record created
            stmt = select(Message).where(
                Message.external_message_id == "mid_other_page_msg"
            )
            msgs = (await session.execute(stmt)).scalars().all()
            assert len(msgs) == 0
