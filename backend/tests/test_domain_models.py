import uuid
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models import (
    ChannelEnum,
    Conversation,
    ConversationStatusEnum,
    Customer,
    CustomerIdentity,
    Message,
    MessageTypeEnum,
    MigrationJob,
    MigrationStatusEnum,
    ProviderEnum,
    RawEvent,
    RawEventStatusEnum,
    SenderTypeEnum,
)


@pytest.mark.asyncio
async def test_create_customer():
    async with AsyncSessionLocal() as session:
        customer = Customer(
            display_name="Alice Smith",
            email="alice@example.com",
            phone="+1234567890",
        )
        session.add(customer)
        await session.commit()
        await session.refresh(customer)

        assert customer.id is not None
        assert customer.display_name == "Alice Smith"
        assert customer.email == "alice@example.com"
        assert customer.phone == "+1234567890"


@pytest.mark.asyncio
async def test_customer_multiple_identities():
    async with AsyncSessionLocal() as session:
        customer = Customer(display_name="Bob Jones", email="bob@example.com")
        session.add(customer)
        await session.flush()

        identity_meta = CustomerIdentity(
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="fb_user_12345",
            metadata_={"profile_pic": "https://example.com/pic.jpg"},
        )
        identity_ig = CustomerIdentity(
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.INSTAGRAM,
            external_user_id="ig_user_67890",
        )
        identity_respond = CustomerIdentity(
            customer_id=customer.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_user_id="wa_contact_999",
        )
        session.add_all([identity_meta, identity_ig, identity_respond])
        await session.commit()

        # Fetch customer with identities
        stmt = (
            select(Customer)
            .where(Customer.id == customer.id)
            .options(selectinload(Customer.identities))
        )
        res = await session.execute(stmt)
        fetched_customer = res.scalar_one()

        assert len(fetched_customer.identities) == 3
        providers = {ident.provider for ident in fetched_customer.identities}
        assert ProviderEnum.META in providers
        assert ProviderEnum.RESPOND_IO in providers


@pytest.mark.asyncio
async def test_customer_identity_uniqueness_constraint():
    async with AsyncSessionLocal() as session:
        c1 = Customer(display_name="User One")
        c2 = Customer(display_name="User Two")
        session.add_all([c1, c2])
        await session.flush()

        id1 = CustomerIdentity(
            customer_id=c1.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="duplicate_ext_id",
        )
        session.add(id1)
        await session.commit()

        # Attempt adding same identity to c2
        id2 = CustomerIdentity(
            customer_id=c2.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="duplicate_ext_id",
        )
        session.add(id2)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_conversation_and_messages_relationships():
    async with AsyncSessionLocal() as session:
        customer = Customer(display_name="Meta Customer")
        session.add(customer)
        await session.flush()

        # Conversation with Meta details compatibility (t_1368342205478597)
        conv = Conversation(
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_1368342205478597",
            status=ConversationStatusEnum.OPEN,
            subject="Customer Inquiry",
        )
        session.add(conv)
        await session.flush()

        msg1 = Message(
            conversation_id=conv.id,
            external_message_id="m_QMU8wDxO4lcsBciEBD-_1",
            sender_type=SenderTypeEnum.CUSTOMER,
            sender_external_id="27703955502560791",
            message_type=MessageTypeEnum.TEXT,
            text="Hello from Messenger!",
        )
        msg2 = Message(
            conversation_id=conv.id,
            external_message_id="m_QMU8wDxO4lcsBciEBD-_2",
            sender_type=SenderTypeEnum.AGENT,
            sender_external_id="agent_100",
            message_type=MessageTypeEnum.TEXT,
            text="Hi! How can I help you today?",
        )
        session.add_all([msg1, msg2])
        await session.commit()

        # Fetch conversation and verify relationships
        stmt = (
            select(Conversation)
            .where(Conversation.id == conv.id)
            .options(
                selectinload(Conversation.customer),
                selectinload(Conversation.messages),
            )
        )
        res = await session.execute(stmt)
        fetched_conv = res.scalar_one()

        assert fetched_conv.customer.display_name == "Meta Customer"
        assert len(fetched_conv.messages) == 2
        assert fetched_conv.messages[0].external_message_id == "m_QMU8wDxO4lcsBciEBD-_1"
        assert fetched_conv.messages[0].sender_external_id == "27703955502560791"


@pytest.mark.asyncio
async def test_conversation_uniqueness_constraint():
    async with AsyncSessionLocal() as session:
        c1 = Customer(display_name="Cust A")
        c2 = Customer(display_name="Cust B")
        session.add_all([c1, c2])
        await session.flush()

        conv1 = Conversation(
            customer_id=c1.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id="conv_unique_123",
        )
        session.add(conv1)
        await session.commit()

        conv2 = Conversation(
            customer_id=c2.id,
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id="conv_unique_123",
        )
        session.add(conv2)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()


@pytest.mark.asyncio
async def test_migration_job_persistence():
    async with AsyncSessionLocal() as session:
        job = MigrationJob(
            provider=ProviderEnum.RESPOND_IO,
            channel=ChannelEnum.WHATSAPP,
            status=MigrationStatusEnum.PENDING,
            total_conversations=150,
            total_messages=1200,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)

        assert job.id is not None
        assert job.status == MigrationStatusEnum.PENDING
        assert job.total_conversations == 150
        assert job.total_messages == 1200


@pytest.mark.asyncio
async def test_raw_event_persistence():
    async with AsyncSessionLocal() as session:
        payload = {
            "object": "page",
            "entry": [
                {
                    "id": "123456",
                    "messaging": [
                        {
                            "sender": {"id": "27703955502560791"},
                            "message": {"text": "Test payload"},
                        }
                    ],
                }
            ],
        }
        event = RawEvent(
            provider=ProviderEnum.META,
            event_type="messages",
            external_event_id="evt_abc123",
            payload=payload,
            status=RawEventStatusEnum.RECEIVED,
        )
        session.add(event)
        await session.commit()
        await session.refresh(event)

        assert event.id is not None
        assert event.provider == ProviderEnum.META
        assert event.payload["entry"][0]["id"] == "123456"
