import asyncio
import logging
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.customer import Customer, CustomerIdentity
from app.models.conversation import Conversation
from app.models.message import Message

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PurgeSyntheticData")


async def purge_synthetic_records():
    async with AsyncSessionLocal() as session:
        async with session.begin():
            logger.info("Initiating targeted synthetic data purge...")

            # 1. Identify mock messages by external IDs or test content signatures
            mock_msgs_stmt = select(Message).where(
                (Message.external_message_id.like("%test%"))
                | (Message.external_message_id.like("%mock%"))
                | (Message.external_message_id.like("wamid.%"))
                | (Message.text.like("%📸%"))
            )
            mock_msgs = (await session.execute(mock_msgs_stmt)).scalars().all()
            for msg in mock_msgs:
                logger.info("Purging synthetic message: %s | %s", msg.id, msg.text)
                await session.delete(msg)

            # 2. Identify synthetic customers and associated conversations/identities
            mock_cust_stmt = select(Customer).where(
                (Customer.display_name.like("%Instagram (2322)%"))
                | (Customer.display_name.like("%مستخدم Messenger%"))
                | (Customer.display_name.like("%WhatsApp VIP Customer%"))
            )
            mock_customers = (await session.execute(mock_cust_stmt)).scalars().all()

            for cust in mock_customers:
                logger.info("Purging synthetic customer: %s (%s)", cust.id, cust.display_name)

                # Delete conversations and child messages
                conv_stmt = select(Conversation).where(Conversation.customer_id == cust.id)
                convs = (await session.execute(conv_stmt)).scalars().all()
                for c in convs:
                    await session.execute(delete(Message).where(Message.conversation_id == c.id))
                    await session.delete(c)

                # Delete identities
                await session.execute(delete(CustomerIdentity).where(CustomerIdentity.customer_id == cust.id))
                await session.delete(cust)

            # 3. Clean up any orphaned conversations with zero remaining messages
            orphaned_convs = (
                await session.execute(
                    select(Conversation).where(
                        ~Conversation.id.in_(select(Message.conversation_id).distinct())
                    )
                )
            ).scalars().all()

            for oc in orphaned_convs:
                logger.info("Purging orphaned conversation: %s (Channel: %s)", oc.id, oc.channel)
                await session.delete(oc)

        logger.info("Purge complete. Database state cleanly restored.")


if __name__ == "__main__":
    asyncio.run(purge_synthetic_records())
