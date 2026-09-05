import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum
from app.models.message import Message
from app.services.message_service import MessageService


@pytest.mark.asyncio
async def test_presence_last_activity_at_models_and_migration():
    """Verify last_activity_at exists and defaults to NOW() on Conversation and Customer."""
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Presence Test Customer")
        session.add(cust)
        await session.flush()

        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id=f"presence_conv_{uuid.uuid4().hex[:8]}",
        )
        session.add(conv)
        await session.commit()

        await session.refresh(cust)
        await session.refresh(conv)

        assert cust.last_activity_at is not None
        assert conv.last_activity_at is not None
        assert isinstance(cust.last_activity_at, datetime)
        assert isinstance(conv.last_activity_at, datetime)


@pytest.mark.asyncio
async def test_message_service_updates_last_activity_at():
    """Verify MessageService.create_message updates last_activity_at on conversation and customer."""
    async with AsyncSessionLocal() as session:
        cust = Customer(display_name="Presence Activity Customer")
        session.add(cust)
        await session.flush()

        old_time = datetime.now(timezone.utc) - timedelta(hours=2)
        conv = Conversation(
            customer_id=cust.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.WHATSAPP,
            external_conversation_id=f"wa_presence_{uuid.uuid4().hex[:8]}",
            last_activity_at=old_time,
        )
        session.add(conv)
        await session.commit()

        # Create inbound message
        msg = await MessageService.create_message(
            session=session,
            conversation_id=conv.id,
            sender_type=SenderTypeEnum.CUSTOMER,
            text="مرحباً أريد استفسار عن المنتج",
        )

        await session.refresh(conv)
        await session.refresh(cust)

        assert conv.last_activity_at > old_time
        assert cust.last_activity_at > old_time


@pytest.mark.asyncio
async def test_api_conversations_includes_last_activity_at():
    """Verify API endpoint GET /api/v1/conversations serializes last_activity_at in JSON payload."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/conversations")
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        if len(data["items"]) > 0:
            item = data["items"][0]
            assert "last_activity_at" in item
