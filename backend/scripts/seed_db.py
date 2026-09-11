import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models import (
    ChannelEnum,
    Conversation,
    ConversationStatusEnum,
    Customer,
    CustomerIdentity,
    Message,
    ProviderEnum,
)


async def seed_database():
    async with AsyncSessionLocal() as session:
        # Check if already seeded
        result = await session.execute(select(Customer))
        existing_customers = result.scalars().all()
        if existing_customers:
            print(f"Database already contains {len(existing_customers)} customers. Seed skipped.")
            return

        print("Seeding initial live CRM data...")

        # 1. Customer 1: Sara Ahmed (LAVVA)
        cust1 = Customer(
            id=uuid.uuid4(),
            display_name="سارة أحمد",
            phone="01012345678",
            email="sara.ahmed@example.com",
            tags=["درجة أولى", "مختلطة", "جديد"],
        )
        session.add(cust1)
        await session.flush()

        ident1 = CustomerIdentity(
            id=uuid.uuid4(),
            customer_id=cust1.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="psid_901",
        )
        session.add(ident1)

        conv1 = Conversation(
            id=uuid.uuid4(),
            customer_id=cust1.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_1302055352987458_psid_901",
            status=ConversationStatusEnum.OPEN,
            subject="استفسار عن كورس العناية بالبشرة",
            assigned_agent_id="أحمد محمود",
            priority="urgent",
            last_message_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        session.add(conv1)
        await session.flush()

        msg1 = Message(
            id=uuid.uuid4(),
            conversation_id=conv1.id,
            external_message_id="m_ext_live_901_1",
            sender_type="customer",
            sender_external_id="psid_901",
            message_type="text",
            text="أهلاً بكم! أريد معرفة تفاصيل وأسعار كورس البشرة المختلطة لدى LAVVA؟",
            created_at=datetime.now(timezone.utc) - timedelta(minutes=15),
        )
        msg2 = Message(
            id=uuid.uuid4(),
            conversation_id=conv1.id,
            external_message_id="m_ext_live_901_2",
            sender_type="agent",
            sender_external_id="agent_1",
            message_type="text",
            text="أهلاً بك سارة! يسعدنا جداً تواصلك معنا في مجموعة LUXIRA. كورس البشرة المختلطة متوفر حالياً مع خصم حصري ٢٠٪.",
            created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        session.add_all([msg1, msg2])

        # 2. Customer 2: Mohamed Ali (MOON LIGHT)
        cust2 = Customer(
            id=uuid.uuid4(),
            display_name="محمد علي",
            phone="01198765432",
            email="mohamed.ali@example.com",
            tags=["درجة ثانية", "دهنية", "تم البيع"],
        )
        session.add(cust2)
        await session.flush()

        ident2 = CustomerIdentity(
            id=uuid.uuid4(),
            customer_id=cust2.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_user_id="psid_902",
        )
        session.add(ident2)

        conv2 = Conversation(
            id=uuid.uuid4(),
            customer_id=cust2.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="t_1302055352987458_psid_902",
            status=ConversationStatusEnum.OPEN,
            subject="تأكيد توصيل الطلب",
            assigned_agent_id="سارة علي",
            priority="normal",
            last_message_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
        session.add(conv2)
        await session.flush()

        msg3 = Message(
            id=uuid.uuid4(),
            conversation_id=conv2.id,
            external_message_id="m_ext_live_902_1",
            sender_type="customer",
            sender_external_id="psid_902",
            message_type="text",
            text="تم استلام الشحنة بنجاح، شكراً لكم على سرعة التوصيل والاحترام.",
            created_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
        session.add(msg3)

        await session.commit()
        print("Database successfully seeded with 2 live customer threads!")


if __name__ == "__main__":
    asyncio.run(seed_database())
