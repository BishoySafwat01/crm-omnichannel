import pytest
from app.core.database import AsyncSessionLocal
from app.models import (
    ChannelEnum,
    ConversationStatusEnum,
    MessageTypeEnum,
    MigrationStatusEnum,
    ProviderEnum,
    SenderTypeEnum,
)
from app.services import (
    ConversationService,
    CustomerService,
    MessageService,
    MigrationService,
)


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
