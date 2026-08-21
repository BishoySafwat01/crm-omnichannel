import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

# Ensure app imports work
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
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

async def seed_multichannel_conversations():
    print("🌱 Seeding Multi-Channel WhatsApp & Instagram Conversations...")
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)

        SEED_CUSTOMERS = [
            # 1. WhatsApp Customer 1: UAE (LUXIRA)
            {
                "name": "سارة المنصوري",
                "phone": "+971 50 123 4567",
                "email": "sara.almansoori@gmail.com",
                "country": "الإمارات",
                "city": "دبي",
                "location": "دبي، الإمارات العربية المتحدة",
                "channel": ChannelEnum.WHATSAPP,
                "provider": ProviderEnum.META,
                "ext_user_id": "wa_971501234567",
                "subject": "استفسار عن بكج الهدايا والتوصيل السريع 🎁",
                "priority": "high",
                "brand": "LUXIRA",
                "messages": [
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "مرحباً، أود الاستفسار عن بكج الهدايا الفاخر وتكلفة التوصيل السريع إلى دبي.",
                        "delta_min": 45,
                    },
                    {
                        "sender": SenderTypeEnum.AGENT,
                        "text": "أهلاً بكِ أ. سارة ✨! يتوفر بكج الهدايا شامل التغليف الملكي مع خدمة التوصيل السريع خلال 24 ساعة لجميع مناطق دبي والأبوظبي.",
                        "delta_min": 30,
                    },
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "ممتاز جداً! كيف يمكنني إتمام الطلب والدفع الإلكتروني؟",
                        "delta_min": 10,
                    },
                ],
            },
            # 2. WhatsApp Customer 2: KSA (LAVVA)
            {
                "name": "عمر السعيد",
                "phone": "+966 55 987 6543",
                "email": "omar.alsaeed@saudi.sa",
                "country": "السعودية",
                "city": "الرياض",
                "location": "الرياض، المملكة العربية السعودية",
                "channel": ChannelEnum.WHATSAPP,
                "provider": ProviderEnum.META,
                "ext_user_id": "wa_966559876543",
                "subject": "طلب استبدال مقاس وتتبع الشحنة 📦",
                "priority": "urgent",
                "brand": "LAVVA",
                "messages": [
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "السلام عليكم، أود استبدال مقاس المنتج في طلبي الأخير وإرسال رقم تتبع الشحنة.",
                        "delta_min": 120,
                    },
                    {
                        "sender": SenderTypeEnum.AGENT,
                        "text": "وعليكم السلام أ. عمر! يسعدنا مساعدتك، يرجى تزويدنا برقم الطلب وسنقوم بإرسال بوليصة الاستبدال فوراً.",
                        "delta_min": 90,
                    },
                ],
            },
            # 3. WhatsApp Customer 3: Egypt (LAVVA)
            {
                "name": "كريم ممدوح",
                "phone": "+20 100 555 1234",
                "email": "kareem.mamdouh@yahoo.com",
                "country": "مصر",
                "city": "القاهرة",
                "location": "القاهرة، مصر",
                "channel": ChannelEnum.WHATSAPP,
                "provider": ProviderEnum.META,
                "ext_user_id": "wa_201005551234",
                "subject": "استفسار عن عروض الصيف وكود الخصم ☀️",
                "priority": "normal",
                "brand": "LAVVA",
                "messages": [
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "مساء الخير، هل عروض الصيف الخصم 20% ممتدة لنهاية الأسبوع؟",
                        "delta_min": 60,
                    },
                    {
                        "sender": SenderTypeEnum.AGENT,
                        "text": "مساء النور أ. كريم! نعم العروض مستمرة وتستطيع استخدام كود الخصم SUMMER20 عند إتمام الطلب.",
                        "delta_min": 40,
                    },
                ],
            },
            # 4. Instagram Customer 4: Nour Beauty (@nour_style) (LUXIRA)
            {
                "name": "Nour Beauty",
                "phone": "+20 111 888 9999",
                "email": "nour.style@instagram.com",
                "country": "مصر",
                "city": "القاهرة",
                "location": "التجمع الخامس، القاهرة، مصر",
                "channel": ChannelEnum.INSTAGRAM,
                "provider": ProviderEnum.META,
                "ext_user_id": "ig_nour_style_1784",
                "subject": "استفسار عن توفر ألوان الروج في فرع التجمع 💄",
                "priority": "normal",
                "brand": "LUXIRA",
                "messages": [
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "هاي! هل مجموعة الروج الجديدة متوفرة في فرع التجمع الخامس ولا فرع مول العرب؟",
                        "delta_min": 180,
                    },
                    {
                        "sender": SenderTypeEnum.AGENT,
                        "text": "أهلاً نور 🌸 متوفرة بجميع درجاتها في فرع التجمع الخامس وكذلك في فرع مول العرب!",
                        "delta_min": 150,
                    },
                ],
            },
            # 5. Instagram Customer 5: Reem Fashion (@reem.luxury) (LUXIRA)
            {
                "name": "Reem Fashion",
                "phone": "+965 99 123 456",
                "email": "reem.fashion@kuwait.kw",
                "country": "الكويت",
                "city": "الكويت",
                "location": "مدينة الكويت، الكويت",
                "channel": ChannelEnum.INSTAGRAM,
                "provider": ProviderEnum.META,
                "ext_user_id": "ig_reem_luxury_9988",
                "subject": "طلب فستان خاص مع الشحن الدولي 👗",
                "priority": "high",
                "brand": "LUXIRA",
                "messages": [
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "مرحباً بكم، هل يتوفر شحن مباشر إلى الكويت لطلب فستان السهرة الملكي؟",
                        "delta_min": 240,
                    },
                    {
                        "sender": SenderTypeEnum.AGENT,
                        "text": "أهلاً بكِ ريم ✨ نعم يتوفر الشحن الدولي المباشر إلى الكويت عبر DHL خلال 3 أيام عمل.",
                        "delta_min": 210,
                    },
                ],
            },
            # 6. Instagram Customer 6: Lujain Style (@lujain_lavva) (LAVVA)
            {
                "name": "Lujain Style",
                "phone": "+966 50 777 8888",
                "email": "lujain@lavva.style",
                "country": "السعودية",
                "city": "جدة",
                "location": "جدة، المملكة العربية السعودية",
                "channel": ChannelEnum.INSTAGRAM,
                "provider": ProviderEnum.META,
                "ext_user_id": "ig_lujain_lavva_55",
                "subject": "استفسار عن تشكيلة LAVVA الصيفية 🌟",
                "priority": "normal",
                "brand": "LAVVA",
                "messages": [
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "مرحباً! متى تنزل التشكيلة الصيفية لعلامة LAVVA في فرع جدة؟",
                        "delta_min": 100,
                    },
                    {
                        "sender": SenderTypeEnum.AGENT,
                        "text": "أهلاً لجين 🌸 التشكيلة الجديدة متاحة الآن بالموقع وفي فرع جدة الروضة!",
                        "delta_min": 75,
                    },
                ],
            },
            # 7. Instagram Customer 7: Yasmin Glam (@yasmin_lavva) (LAVVA)
            {
                "name": "Yasmin Glam",
                "phone": "+20 102 333 4444",
                "email": "yasmin.glam@egypt.eg",
                "country": "مصر",
                "city": "الإسكندرية",
                "location": "الإسكندرية، مصر",
                "channel": ChannelEnum.INSTAGRAM,
                "provider": ProviderEnum.META,
                "ext_user_id": "ig_yasmin_lavva_99",
                "subject": "متابعة كود خصم المؤثرات ✨",
                "priority": "high",
                "brand": "LAVVA",
                "messages": [
                    {
                        "sender": SenderTypeEnum.CUSTOMER,
                        "text": "هاي فريق LAVVA! حابة أطلب كود الخصم الخاص بالتغطية.",
                        "delta_min": 50,
                    },
                    {
                        "sender": SenderTypeEnum.AGENT,
                        "text": "أهلاً ياسمين ✨ تم إرسال الكود الخصم VIP عبر الرسائل الخاصة بنجاح!",
                        "delta_min": 25,
                    },
                ],
            },
        ]

        created_conv_count = 0
        for item in SEED_CUSTOMERS:
            # Check existing identity to avoid duplication
            stmt_ident = select(CustomerIdentity).where(
                CustomerIdentity.external_user_id == item["ext_user_id"],
                CustomerIdentity.channel == item["channel"],
            )
            res_ident = await session.execute(stmt_ident)
            existing_ident = res_ident.scalar_one_or_none()

            if existing_ident:
                print(f"  └─ Skipped existing record: {item['name']} ({item['channel'].value})")
                continue

            # Create Customer
            customer = Customer(
                id=uuid.uuid4(),
                display_name=item["name"],
                phone=item["phone"],
                email=item["email"],
                country=item["country"],
                city=item["city"],
                location=item["location"],
                tags=[item["channel"].value.lower(), "vip_client", item["country"]],
            )
            session.add(customer)
            await session.flush()

            # Create CustomerIdentity
            identity = CustomerIdentity(
                id=uuid.uuid4(),
                customer_id=customer.id,
                provider=item["provider"],
                channel=item["channel"],
                external_user_id=item["ext_user_id"],
            )
            session.add(identity)
            await session.flush()

            # Create Conversation
            last_msg_time = now - timedelta(minutes=item["messages"][-1]["delta_min"])
            conv = Conversation(
                id=uuid.uuid4(),
                customer_id=customer.id,
                provider=item["provider"],
                channel=item["channel"],
                external_conversation_id=f"conv_{item['ext_user_id']}",
                subject=item["subject"],
                status=ConversationStatusEnum.OPEN,
                priority=item["priority"],
                brand=item["brand"],
                unread_count=1,
                last_message_at=last_msg_time,
            )
            session.add(conv)
            await session.flush()

            # Add Messages
            for m in item["messages"]:
                msg_time = now - timedelta(minutes=m["delta_min"])
                msg = Message(
                    id=uuid.uuid4(),
                    conversation_id=conv.id,
                    sender_type=m["sender"],
                    sender_external_id=item["ext_user_id"] if m["sender"] == SenderTypeEnum.CUSTOMER else "agent_system",
                    text=m["text"],
                    message_type=MessageTypeEnum.TEXT,
                    external_message_id=f"msg_{uuid.uuid4().hex[:12]}",
                    created_at=msg_time,
                )
                session.add(msg)

            created_conv_count += 1
            print(f"  ✅ Created {item['channel'].value:9} Conversation ({item['brand']:7}): {item['name']} ({item['country']})")

        await session.commit()
        print(f"\n🎉 Successfully seeded {created_conv_count} new WhatsApp & Instagram conversations in PostgreSQL!")

if __name__ == "__main__":
    asyncio.run(seed_multichannel_conversations())
