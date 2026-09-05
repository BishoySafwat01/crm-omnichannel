import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.core.country_detector import CountryDetector


async def backfill_all():
    async with AsyncSessionLocal() as session:
        convs = (await session.execute(select(Conversation))).scalars().all()
        count = 0
        for conv in convs:
            if not conv.customer_id:
                continue

            msgs = (
                await session.execute(
                    select(Message)
                    .where(Message.conversation_id == conv.id)
                    .order_by(Message.created_at.desc())
                    .limit(2)
                )
            ).scalars().all()

            found_loc = None
            for m in msgs:
                if m.text:
                    loc = CountryDetector.extract_country(m.text)
                    if loc:
                        found_loc = loc
                        break

            final_loc = found_loc if found_loc else "غير ذلك"
            cust = await session.get(Customer, conv.customer_id)
            if cust:
                cust.location = final_loc
                session.add(cust)
                count += 1
                print(f"Sync: Conv {conv.id} -> Customer {conv.customer_id} -> {final_loc}")

        await session.commit()
        print(f"✅ Successfully synchronized {count} customer locations based on last 2 messages.")


if __name__ == "__main__":
    asyncio.run(backfill_all())
