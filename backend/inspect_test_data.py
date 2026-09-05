import asyncio
import logging
from sqlalchemy import select, or_, func
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.message import Message

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("inspect_test_data")

async def inspect():
    async with AsyncSessionLocal() as session:
        # Check test conversations
        test_conv_stmt = select(Conversation).where(
            or_(
                Conversation.external_conversation_id.ilike("%smoke_test%"),
                Conversation.external_conversation_id.ilike("%test_%"),
                Conversation.external_conversation_id.ilike("%t_outbound%"),
                Conversation.external_conversation_id.ilike("%conv_msg_hist%"),
                Conversation.external_conversation_id.ilike("%conv_filter%"),
                Conversation.subject.ilike("%test%"),
                Conversation.subject.ilike("%Msg Owner%"),
                Conversation.subject.ilike("%Conv Owner%"),
                Conversation.subject.ilike("%Outbound Target%"),
                Conversation.brand == "LAVVA",
                Conversation.brand == "Default Business Page",
            )
        )
        test_convs = (await session.execute(test_conv_stmt)).scalars().all()
        logger.info("Found %d suspect test conversations:", len(test_convs))
        for c in test_convs:
            cust = await session.get(Customer, c.customer_id)
            cust_name = cust.display_name if cust else "None"
            logger.info("  Conv ID: %s | Brand: %s | ExtID: %s | Subject: %s | Customer: %s",
                        c.id, c.brand, c.external_conversation_id, c.subject, cust_name)

        # Check mock customers
        test_cust_stmt = select(Customer).where(
            or_(
                Customer.display_name.ilike("%Test Customer%"),
                Customer.display_name.ilike("%Cust A%"),
                Customer.display_name.ilike("%Cust B%"),
                Customer.display_name.ilike("%Msg Owner%"),
                Customer.display_name.ilike("%Conv Owner%"),
                Customer.display_name.ilike("%Outbound Target%"),
                Customer.display_name.ilike("%Phase 3B%"),
            )
        )
        test_custs = (await session.execute(test_cust_stmt)).scalars().all()
        logger.info("Found %d suspect test customers:", len(test_custs))
        for cust in test_custs:
            logger.info("  Cust ID: %s | Name: %s | Email: %s | Phone: %s",
                        cust.id, cust.display_name, cust.email, cust.phone)

if __name__ == "__main__":
    asyncio.run(inspect())
