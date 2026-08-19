import asyncio
import logging
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.core.country_detector import CountryDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LocationBackfill")


async def backfill_locations():
    async with AsyncSessionLocal() as session:
        customers = (await session.execute(select(Customer))).scalars().all()
        updated_count = 0
        detected_count = 0

        for cust in customers:
            convs = (
                await session.execute(
                    select(Conversation).where(Conversation.customer_id == cust.id)
                )
            ).scalars().all()

            found_location = None
            for conv in convs:
                msgs = (
                    await session.execute(
                        select(Message)
                        .where(Message.conversation_id == conv.id)
                        .order_by(Message.created_at.asc())
                    )
                ).scalars().all()

                for msg in msgs:
                    loc = CountryDetector.extract_country(msg.text)
                    if loc:
                        found_location = loc
                        detected_count += 1
                        break
                if found_location:
                    break

            cust.location = found_location if found_location else "غير ذلك"
            session.add(cust)
            updated_count += 1

        await session.commit()
        logger.info(
            "[Backfill] Successfully updated location for %d customers (%d with detected country flags).",
            updated_count,
            detected_count,
        )


if __name__ == "__main__":
    asyncio.run(backfill_locations())
