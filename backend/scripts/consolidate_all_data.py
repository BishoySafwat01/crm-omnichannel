import asyncio
import logging
from sqlalchemy import delete, func, select, update

from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.message import Message

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("consolidate_all_data")


async def consolidate():
    async with AsyncSessionLocal() as session:
        logger.info("Starting deep conversation & message consolidation...")

        # 1. Fetch all customers
        cust_stmt = select(Customer)
        customers = (await session.execute(cust_stmt)).scalars().all()

        total_reassigned = 0
        total_deleted_convs = 0

        for cust in customers:
            # Fetch all conversations for this customer
            conv_stmt = (
                select(Conversation)
                .where(Conversation.customer_id == cust.id)
                .order_by(Conversation.created_at.asc())
            )
            convs = (await session.execute(conv_stmt)).scalars().all()

            if len(convs) <= 1:
                continue

            # Find primary conversation (one with most messages or oldest)
            primary_conv = None
            max_msgs = -1

            for c in convs:
                count_stmt = select(func.count(Message.id)).where(
                    Message.conversation_id == c.id
                )
                msg_count = (await session.execute(count_stmt)).scalar() or 0
                if msg_count > max_msgs:
                    max_msgs = msg_count
                    primary_conv = c

            if not primary_conv:
                primary_conv = convs[0]

            logger.info(
                "Customer %s (ID: %s) has %d conversations. Primary: %s (%d messages)",
                cust.display_name,
                cust.id,
                len(convs),
                primary_conv.id,
                max_msgs,
            )

            for c in convs:
                if c.id == primary_conv.id:
                    continue
                # Reassign messages to primary_conv
                reassign_stmt = (
                    update(Message)
                    .where(Message.conversation_id == c.id)
                    .values(conversation_id=primary_conv.id)
                )
                res = await session.execute(reassign_stmt)
                reassigned_count = res.rowcount
                total_reassigned += reassigned_count
                logger.info(
                    "Reassigned %d messages from duplicate conv %s to primary %s",
                    reassigned_count,
                    c.id,
                    primary_conv.id,
                )

                # Delete duplicate conversation shell
                await session.delete(c)
                total_deleted_convs += 1

        await session.commit()

        # Final stats
        all_convs = (await session.execute(select(Conversation))).scalars().all()
        total_messages = (
            await session.execute(select(func.count(Message.id)))
        ).scalar() or 0

        logger.info(
            "Consolidation complete! Active Conversations: %d, Total Messages: %d, Reassigned Messages: %d, Deleted Convs: %d",
            len(all_convs),
            total_messages,
            total_reassigned,
            total_deleted_convs,
        )


if __name__ == "__main__":
    asyncio.run(consolidate())
