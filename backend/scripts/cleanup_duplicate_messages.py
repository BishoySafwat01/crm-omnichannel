import asyncio
from sqlalchemy import select, func
from app.core.database import AsyncSessionLocal
from app.models.message import Message
from app.models.enums import SenderTypeEnum

async def cleanup():
    async with AsyncSessionLocal() as db:
        # Find potential duplicate agent messages with identical conversation, text, and sender
        stmt = (
            select(Message.conversation_id, Message.text, func.count(Message.id))
            .where(Message.sender_type == SenderTypeEnum.AGENT, Message.text.isnot(None), Message.text != '')
            .group_by(Message.conversation_id, Message.text)
            .having(func.count(Message.id) > 1)
        )
        dupes = (await db.execute(stmt)).all()
        
        deleted_count = 0
        for conv_id, text, count in dupes:
            msgs = (await db.execute(
                select(Message)
                .where(
                    Message.conversation_id == conv_id,
                    Message.sender_type == SenderTypeEnum.AGENT,
                    Message.text == text
                )
                .order_by(Message.created_at.asc())
            )).scalars().all()
            
            # Keep the first, delete subsequent duplicate copies
            for duplicate in msgs[1:]:
                await db.delete(duplicate)
                deleted_count += 1
                
        await db.commit()
        print(f"✅ Successfully cleaned up {deleted_count} duplicate message records.")

if __name__ == "__main__":
    asyncio.run(cleanup())
