from datetime import datetime, timedelta, timezone

import pytest
from app.core.database import AsyncSessionLocal
from app.models import (
    ChannelEnum,
    ConversationStatusEnum,
    MessageTypeEnum,
    Message,
    MigrationStatusEnum,
    ProviderEnum,
    SenderTypeEnum,
)
from app.services import (
    ConversationService,
    CustomerService,
    MessageService,
    MigrationService,
    ConnectedPageService,
)
from app.models.connected_page import ConnectedPage



@pytest.mark.asyncio
async def test_customer_service_get_or_create():
    async with AsyncSessionLocal() as session:
        # Create
        customer, identity = await CustomerService.get_or_create_customer_with_identity(
            session=session,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="user_fb_999",
            display_name="Service Test User",
            email="service@example.com",
        )
        assert customer.id is not None
        assert identity.external_user_id == "user_fb_999"

        # Get existing
        existing_cust, existing_ident = (
            await CustomerService.get_or_create_customer_with_identity(
                session=session,
                provider=ProviderEnum.META,
                channel=ChannelEnum.MESSENGER,
                external_user_id="user_fb_999",
            )
        )
        assert existing_cust.id == customer.id
        assert existing_ident.id == identity.id


@pytest.mark.asyncio
async def test_conversation_and_message_services():
    async with AsyncSessionLocal() as session:
        customer = await CustomerService.create_customer(
            session=session, display_name="Conv Test Customer"
        )

        conv = await ConversationService.create_conversation(
            session=session,
            customer_id=customer.id,
            provider=ProviderEnum.BEON,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id="beon_conv_555",
            subject="WhatsApp Chat",
        )
        assert conv.id is not None
        assert conv.status == ConversationStatusEnum.OPEN

        msg = await MessageService.create_message(
            session=session,
            conversation_id=conv.id,
            sender_type=SenderTypeEnum.CUSTOMER,
            external_message_id="msg_wa_001",
            text="Hello over WhatsApp",
        )
        assert msg.id is not None
        assert msg.conversation_id == conv.id

        messages = await MessageService.list_messages_for_conversation(
            session=session, conversation_id=conv.id
        )
        assert len(messages) == 1
        assert messages[0].text == "Hello over WhatsApp"


@pytest.mark.asyncio
async def test_create_non_customer_message_clears_unread_count():
    async with AsyncSessionLocal() as session:
        customer = await CustomerService.create_customer(
            session=session, display_name="__TEST__ unread bot customer"
        )
        conv = await ConversationService.create_conversation(
            session=session,
            customer_id=customer.id,
            provider=ProviderEnum.BEON,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id=f"__TEST__unread_bot_{customer.id}",
        )
        conv.unread_count = 5
        await session.commit()

        await MessageService.create_message(
            session=session,
            conversation_id=conv.id,
            sender_type=SenderTypeEnum.SYSTEM,
            text="Automated reply",
        )

        await session.refresh(conv)
        assert conv.unread_count == 0
        assert conv.is_unread is False


@pytest.mark.asyncio
async def test_delayed_outbound_message_does_not_clear_newer_customer_unread():
    async with AsyncSessionLocal() as session:
        customer = await CustomerService.create_customer(
            session=session, display_name="__TEST__ delayed outbound customer"
        )
        conv = await ConversationService.create_conversation(
            session=session,
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id=f"__TEST__delayed_outbound_{customer.id}",
        )
        now = datetime.now(timezone.utc)
        session.add_all(
            [
                Message(
                    conversation_id=conv.id,
                    sender_type=SenderTypeEnum.CUSTOMER,
                    message_type=MessageTypeEnum.TEXT,
                    text="Newest customer message",
                    created_at=now,
                ),
                Message(
                    conversation_id=conv.id,
                    sender_type=SenderTypeEnum.AGENT,
                    message_type=MessageTypeEnum.TEXT,
                    text="Delayed outbound echo",
                    created_at=now - timedelta(minutes=1),
                ),
            ]
        )
        conv.unread_count = 2
        await session.flush()

        await ConversationService.sync_unread_state_with_latest_message(session, conv)
        await session.commit()

        await session.refresh(conv)
        assert conv.unread_count == 2
        assert conv.is_unread is True


@pytest.mark.asyncio
async def test_list_conversations_masks_stale_unread_for_latest_outbound_message():
    async with AsyncSessionLocal() as session:
        customer = await CustomerService.create_customer(
            session=session, display_name="__TEST__ unread list customer"
        )
        conv = await ConversationService.create_conversation(
            session=session,
            customer_id=customer.id,
            provider=ProviderEnum.BEON,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id=f"__TEST__unread_list_{customer.id}",
        )
        await MessageService.create_message(
            session=session,
            conversation_id=conv.id,
            sender_type=SenderTypeEnum.AGENT,
            text="Agent replied",
        )
        conv.unread_count = 6
        await session.commit()

        conversations, _ = await ConversationService.list_conversations(
            session=session, customer_id=customer.id
        )

        item = next(item for item in conversations if item["id"] == conv.id)
        assert item["last_sender_type"] == "agent"
        assert item["unread_count"] == 0
        assert item["is_unread"] is False


@pytest.mark.asyncio
async def test_unread_summary_excludes_stale_unread_for_latest_outbound_message():
    async with AsyncSessionLocal() as session:
        brand = f"__TEST__ unread summary brand"
        customer = await CustomerService.create_customer(
            session=session, display_name="__TEST__ unread summary customer"
        )
        conv = await ConversationService.create_conversation(
            session=session,
            customer_id=customer.id,
            provider=ProviderEnum.BEON,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id=f"__TEST__unread_summary_{customer.id}",
            brand=brand,
        )
        await MessageService.create_message(
            session=session,
            conversation_id=conv.id,
            sender_type=SenderTypeEnum.AGENT,
            text="Agent replied",
        )
        conv.unread_count = 7
        await session.commit()

        customer_latest = await CustomerService.create_customer(
            session=session, display_name="__TEST__ unread summary positive customer"
        )
        customer_conv = await ConversationService.create_conversation(
            session=session,
            customer_id=customer_latest.id,
            provider=ProviderEnum.BEON,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id=f"__TEST__unread_summary_positive_{customer_latest.id}",
            brand=brand,
        )
        await MessageService.create_message(
            session=session,
            conversation_id=customer_conv.id,
            sender_type=SenderTypeEnum.CUSTOMER,
            text="Customer message",
        )
        customer_conv.unread_count = 7
        await session.commit()

        outbound_detail = await ConversationService.get_conversation_detail(session, conv.id)
        customer_detail = await ConversationService.get_conversation_detail(session, customer_conv.id)
        assert outbound_detail["unread_count"] == 0
        assert outbound_detail["is_unread"] is False
        assert customer_detail["unread_count"] == 1
        assert customer_detail["is_unread"] is True

        summary = await ConversationService.get_unread_summary(
            session=session, brand=brand
        )

        assert summary["total_unread"] == 1
        assert summary["channels"]["whatsapp"] == 1


@pytest.mark.asyncio
async def test_migration_service():
    async with AsyncSessionLocal() as session:
        job = await MigrationService.create_migration_job(
            session=session,
            provider=ProviderEnum.META,
            channel=ChannelEnum.INSTAGRAM,
        )
        assert job.status == MigrationStatusEnum.PENDING

        updated_job = await MigrationService.update_migration_status(
            session=session,
            job_id=job.id,
            status=MigrationStatusEnum.RUNNING,
        )
        assert updated_job.status == MigrationStatusEnum.RUNNING
        assert updated_job.started_at is not None

        completed_job = await MigrationService.update_migration_status(
            session=session,
            job_id=job.id,
            status=MigrationStatusEnum.COMPLETED,
        )
        assert completed_job.status == MigrationStatusEnum.COMPLETED
        assert completed_job.completed_at is not None


@pytest.mark.asyncio
async def test_soft_delete_page_cascades_to_conversations_and_messages(monkeypatch):
    import httpx

    async def mock_delete(self, *args, **kwargs):
        class MockResp:
            status_code = 200
            text = '{"success": true}'
            def json(self):
                return {"success": True}
        return MockResp()

    monkeypatch.setattr(httpx.AsyncClient, "delete", mock_delete)


    from app.core.security import encrypt_token
    import uuid

    unique_pid = f"test_p_{uuid.uuid4().hex[:10]}"

    async with AsyncSessionLocal() as session:
        # Create a connected page
        page = ConnectedPage(
            page_id=unique_pid,
            name="Delete Test Page",
            encrypted_access_token=encrypt_token("fake_token_for_test"),
            status="CONNECTED",
            is_webhook_subscribed=True,
        )




        session.add(page)
        await session.flush()

        customer = await CustomerService.create_customer(
            session=session, display_name="Soft Delete Customer"
        )

        conv = await ConversationService.create_conversation(
            session=session,
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id=f"ext_conv_{uuid.uuid4().hex[:10]}",
            brand="DeleteTestBrand",
        )
        conv.page_id = page.page_id
        conv.connected_page_id = page.id
        await session.flush()

        msg = await MessageService.create_message(
            session=session,
            conversation_id=conv.id,
            sender_type=SenderTypeEnum.CUSTOMER,
            external_message_id=f"msg_{uuid.uuid4().hex[:10]}",
            text="Cascading test message",
        )

        await session.commit()

        # Perform soft delete
        res = await ConnectedPageService.soft_delete_page(session, page.page_id)
        assert res["status"] == "success"
        assert res["page_id"] == page.page_id


        # Verify page is soft-deleted
        from sqlalchemy import select
        deleted_page = (
            await session.execute(
                select(ConnectedPage).where(ConnectedPage.page_id == page.page_id)
            )
        ).scalar_one_or_none()
        assert deleted_page is not None
        assert deleted_page.deleted_at is not None
        assert deleted_page.status == "DELETED"
        assert not deleted_page.is_webhook_subscribed


        # Verify conversation is filtered out in active listings
        active_convs, _ = await ConversationService.list_conversations(session)
        assert conv.id not in [c["id"] for c in active_convs]

        # Verify messages are filtered out
        active_msgs = await MessageService.list_messages_for_conversation(session, conv.id)
        assert len(active_msgs) == 0
