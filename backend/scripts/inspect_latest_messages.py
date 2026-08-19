import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.message import Message

async def inspect():
    async with AsyncSessionLocal() as session:
        msgs = (await session.execute(
            select(Message).order_by(Message.created_at.desc()).limit(10)
        )).scalars().all()
        
        print("\n=== LATEST 10 DATABASE MESSAGES ===")
        for m in msgs:
            print(f"ID: {m.id} | Sender: {m.sender_type} | Type: {m.message_type} | Text: {m.text} | MediaURL: {m.media_url}")
        print("===================================\n")

if __name__ == "__main__":
    asyncio.run(inspect())
