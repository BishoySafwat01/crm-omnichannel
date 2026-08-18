import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.integrations.meta import MetaAPIError
from app.main import app
from app.models import (
    ChannelEnum,
    Conversation,
    ConversationStatusEnum,
    Customer,
    CustomerIdentity,
    Message,
    MessageTypeEnum,
    ProviderEnum,
    SenderTypeEnum,
)


@pytest.mark.asyncio
async def test_get_customers_list_search_and_pagination():
    async with AsyncSessionLocal() as session:
        c1 = Customer(display_name="Alpha User", email="alpha@example.com", phone="+111111")
        c2 = Customer(display_name="Beta User", email="beta@example.com", phone="+222222")
        c3 = Customer(display_name="Gamma Customer", email="gamma@domain.com", phone="+333333")
        session.add_all([c1, c2, c3])
        await session.commit()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 1. GET Customers List
        res = await client.get("/api/v1/customers")
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert data["total"] >= 3

        # 2. Customer Pagination
        res_p = await client.get("/api/v1/customers?page=1&page_size=2")
        assert res_p.status_code == 200
        data_p = res_p.json()
        assert len(data_p["items"]) == 2
        assert data_p["page"] == 1
        assert data_p["page_size"] == 2
        assert data_p["total_pages"] >= 2

        # 3. Customer Search
        res_s = await client.get("/api/v1/customers?search=Alpha")
        assert res_s.status_code == 200
        data_s = res_s.json()
        assert data_s["total"] >= 1
        assert any("Alpha" in c["display_name"] for c in data_s["items"])


@pytest.mark.asyncio
async def test_get_customer_by_id_and_identities():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Detail Customer", email="detail@example.com")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="ext_user_detail_100",
        )
        session.add(ident)
        await session.commit()
        cust_id = cust.id

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 4. GET Customer by ID
        res = await client.get(f"/api/v1/customers/{cust_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == str(cust_id)
        assert len(data["identities"]) == 1

        # 5. GET Customer Identities
        res_i = await client.get(f"/api/v1/customers/{cust_id}/identities")
        assert res_i.status_code == 200
        data_i = res_i.json()
        assert len(data_i) == 1
        assert data_i[0]["external_user_id"] == "ext_user_detail_100"

        # 13. Customer not found
        fake_id = uuid.uuid4()
        res_nf = await client.get(f"/api/v1/customers/{fake_id}")
        assert res_nf.status_code == 404

        # 14. Invalid UUID
        res_inv = await client.get("/api/v1/customers/not-a-valid-uuid")
        assert res_inv.status_code == 422


@pytest.mark.asyncio
async def test_get_conversations_list_filtering_and_pagination():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Conv Owner")
        session.add(cust)
        await session.commit()

        conv1 = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="conv_filter_1",
            subject="Billing Inquiry",
            status=ConversationStatusEnum.OPEN,
        )
        conv2 = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="conv_filter_2",
            subject="Technical Support",
            status=ConversationStatusEnum.CLOSED,
        )
        session.add_all([conv1, conv2])
        await session.commit()
        cust_id = cust.id
        conv1_id = conv1.id

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 6. GET Conversations
        res = await client.get("/api/v1/conversations")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 2

        # 7. Conversation Pagination
        res_p = await client.get("/api/v1/conversations?page=1&page_size=1")
        assert res_p.status_code == 200
        data_p = res_p.json()
        assert len(data_p["items"]) == 1

        # 8 & 16 & 17 & 18. Filtering
        res_f = await client.get(
            f"/api/v1/conversations?customer_id={cust_id}&provider=meta&channel=messenger&status=closed"
        )
        assert res_f.status_code == 200
        data_f = res_f.json()
        assert data_f["total"] == 1
        assert data_f["items"][0]["external_conversation_id"] == "conv_filter_2"

        # Search subject
        res_s = await client.get("/api/v1/conversations?search=Billing")
        assert res_s.status_code == 200
        assert res_s.json()["total"] >= 1

        # 9. GET Conversation by ID
        res_detail = await client.get(f"/api/v1/conversations/{conv1_id}")
        assert res_detail.status_code == 200
        data_d = res_detail.json()
        assert data_d["id"] == str(conv1_id)
        assert data_d["customer_display_name"] == "Conv Owner"

        # 12. Conversation Not Found
        fake_id = uuid.uuid4()
        res_nf = await client.get(f"/api/v1/conversations/{fake_id}")
        assert res_nf.status_code == 404

        # 15. Invalid Pagination
        res_bad_p = await client.get("/api/v1/conversations?page=0")
        assert res_bad_p.status_code == 422


@pytest.mark.asyncio
async def test_get_conversation_messages_and_pagination():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Msg Owner")
        session.add(cust)
        await session.commit()

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="conv_msg_hist",
        )
        session.add(conv)
        await session.commit()

        t1 = datetime(2026, 8, 17, 10, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 8, 17, 10, 1, 0, tzinfo=timezone.utc)

        m1 = Message(
            conversation_id=conv.id,
            external_message_id="m_hist_1",
            sender_type=SenderTypeEnum.CUSTOMER,
            message_type=MessageTypeEnum.TEXT,
            text="First message text",
            created_at=t1,
        )
        m2 = Message(
            conversation_id=conv.id,
            external_message_id="m_hist_2",
            sender_type=SenderTypeEnum.AGENT,
            message_type=MessageTypeEnum.TEXT,
            text="Second message text",
            created_at=t2,
        )
        session.add_all([m1, m2])
        await session.commit()
        conv_id = conv.id

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 10. GET Conversation Messages (ASC order default)
        res = await client.get(f"/api/v1/conversations/{conv_id}/messages")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 2
        assert data["items"][0]["text"] == "First message text"

        # 11. Message Pagination & DESC Order
        res_desc = await client.get(
            f"/api/v1/conversations/{conv_id}/messages?page=1&page_size=1&order=desc"
        )
        assert res_desc.status_code == 200
        data_desc = res_desc.json()
        assert len(data_desc["items"]) == 1
        assert data_desc["items"][0]["text"] == "Second message text"


@pytest.mark.asyncio
async def test_provider_agnostic_outbound_message_endpoint():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Outbound Target")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="user_ext_outbound_api",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_outbound_api_conv",
        )
        session.add(conv)
        await session.commit()
        conv_id = conv.id

    mock_send = AsyncMock(
        return_value={
            "external_message_id": "m_outbound_api_999",
            "recipient_id": "user_ext_outbound_api",
            "raw": {"message_id": "m_outbound_api_999"},
        }
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 19 & 20. Provider-agnostic outbound message endpoint with mock
        with patch(
            "app.integrations.meta.provider.MetaProvider.send_outbound_message",
            mock_send,
        ):
            res = await client.post(
                f"/api/v1/conversations/{conv_id}/messages",
                json={"text": "Hello from provider agnostic endpoint"},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["external_message_id"] == "m_outbound_api_999"
            assert data["sender_type"] == "agent"
            assert data["text"] == "Hello from provider agnostic endpoint"

        # Verify DB persistence
        async with AsyncSessionLocal() as session:
            msgs = (
                await session.execute(
                    select(Message).where(Message.conversation_id == conv_id)
                )
            ).scalars().all()
            assert any(m.external_message_id == "m_outbound_api_999" for m in msgs)


@pytest.mark.asyncio
async def test_outbound_provider_rejection_and_failed_send_no_db_record():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Unsupported Target")
        session.add(cust)
        await session.commit()

        # Unsupported channel conversation (Meta + Instagram)
        conv_unsupported = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.INSTAGRAM,
            external_conversation_id="conv_unsupported_insta",
        )
        session.add(conv_unsupported)

        # Meta conversation that fails send
        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="user_fail_api",
        )
        session.add(ident)
        conv_fail = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_fail_api_conv",
        )
        session.add(conv_fail)
        await session.commit()
        unsupported_id = conv_unsupported.id
        fail_id = conv_fail.id

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 21. Provider/Channel rejection for unsupported channel
        res_un = await client.post(
            f"/api/v1/conversations/{unsupported_id}/messages",
            json={"text": "Hello unsupported"},
        )
        assert res_un.status_code == 400
        assert "not supported" in res_un.json()["detail"].lower()

        # 22. Failed outbound message does not create DB record
        mock_fail = AsyncMock(
            side_effect=MetaAPIError("Meta API connection error 502")
        )
        with patch(
            "app.integrations.meta.provider.MetaProvider.send_outbound_message",
            mock_fail,
        ):
            res_f = await client.post(
                f"/api/v1/conversations/{fail_id}/messages",
                json={"text": "This should fail"},
            )
            assert res_f.status_code == 400

        # Verify no Message created in database
        async with AsyncSessionLocal() as session:
            msgs = (
                await session.execute(
                    select(Message).where(Message.conversation_id == fail_id)
                )
            ).scalars().all()
            assert len(msgs) == 0


@pytest.mark.asyncio
async def test_existing_phase_3b_meta_endpoint_remains_functional():
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Phase 3B Test User")
        session.add(cust)
        await session.commit()

        ident = CustomerIdentity(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="user_p3b_legacy",
        )
        session.add(ident)

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_p3b_legacy_conv",
        )
        session.add(conv)
        await session.commit()
        conv_id = conv.id

    mock_send = AsyncMock(
        return_value={
            "external_message_id": "m_legacy_p3b_111",
            "recipient_id": "user_p3b_legacy",
            "raw": {"message_id": "m_legacy_p3b_111"},
        }
    )

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        # 23. Existing Phase 3B endpoint POST /api/v1/meta/conversations/{id}/messages
        with patch(
            "app.integrations.meta.provider.MetaProvider.send_outbound_message",
            mock_send,
        ):
            res = await client.post(
                f"/api/v1/meta/conversations/{conv_id}/messages",
                json={"text": "Legacy endpoint message"},
            )
            assert res.status_code == 200
            assert res.json()["external_message_id"] == "m_legacy_p3b_111"
