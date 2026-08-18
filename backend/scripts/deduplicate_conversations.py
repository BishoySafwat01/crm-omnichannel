import asyncio
import logging
from sqlalchemy import select, text
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.message import Message

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("deduplicate_conversations")

async def run_deduplication():
    logger.info("Starting conversation deduplication...")
    async with AsyncSessionLocal() as session:
        # Find customer IDs with multiple conversations
        res = await session.execute(
            text("""
                SELECT customer_id, COUNT(*) as conv_count
                FROM conversations
                GROUP BY customer_id
                HAVING COUNT(*) > 1
            """)
        )
        duplicate_customers = res.fetchall()
        logger.info("Found %d customers with duplicate conversation threads", len(duplicate_customers))

        for row in duplicate_customers:
            cust_id = row.customer_id
            # Fetch all conversations for this customer ordered by created_at asc
            conv_stmt = (
                select(Conversation)
                .where(Conversation.customer_id == cust_id)
                .order_by(Conversation.created_at.asc())
            )
            conv_res = await session.execute(conv_stmt)
            convs = list(conv_res.scalars().all())

            primary_conv = convs[0]
            duplicate_convs = convs[1:]
            logger.info(
                "Merging %d duplicate conversations into primary conversation %s for customer %s",
                len(duplicate_convs), primary_conv.id, cust_id
            )

            for dup in duplicate_convs:
                # Move all messages from dup to primary_conv
                await session.execute(
                    text("UPDATE messages SET conversation_id = :primary_id WHERE conversation_id = :dup_id"),
                    {"primary_id": primary_conv.id, "dup_id": dup.id}
                )
                # Update last_message_at if newer
                if dup.last_message_at and (not primary_conv.last_message_at or dup.last_message_at > primary_conv.last_message_at):
                    primary_conv.last_message_at = dup.last_message_at

                # Delete duplicate conversation record
                await session.delete(dup)

            await session.commit()
            logger.info("Deduplication completed for customer %s", cust_id)

    logger.info("All conversation deduplications completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_deduplication())
