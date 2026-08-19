import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation

STORES = ["LAVVA", "MOON LIGHT", "LOTUS BLUE", "BEAUTY CENTER", "LOXX KING", "FLARE"]


async def backfill_stores():
    async with AsyncSessionLocal() as session:
        convs = (await session.execute(select(Conversation))).scalars().all()
        for idx, conv in enumerate(convs):
            assigned_store = STORES[idx % len(STORES)]  # Evenly distribute
            conv.brand = assigned_store
            session.add(conv)
            print(f"Conversation {conv.id} ({conv.customer_id}) -> Assigned Store: {assigned_store}")

        await session.commit()
        print(f"✅ Successfully assigned stores to {len(convs)} conversations.")


if __name__ == "__main__":
    asyncio.run(backfill_stores())
