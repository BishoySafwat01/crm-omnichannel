import asyncio
import logging
from sqlalchemy import select, delete, func, or_
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.message import Message

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("purge_all_test_data")

async def purge():
    async with AsyncSessionLocal() as session:
        # 1. Identify test conversations
        test_conv_stmt = select(Conversation).where(
            or_(
                Conversation.brand == "LAVVA",
                Conversation.brand == "Default Business Page",
                Conversation.external_conversation_id.in_([
                    "conv_filter_1", "conv_filter_2", "conv_msg_hist",
                    "t_outbound_api_conv", "conv_unsupported_tiktok",
                    "t_fail_api_conv", "t_p3b_legacy_conv",
                    "t_1368342205478597", "conv_unique_123"
                ]),
                Conversation.external_conversation_id.ilike("%smoke_test%"),
                Conversation.external_conversation_id.ilike("%test_smoke%"),
                Conversation.external_conversation_id.ilike("%__TEST__%"),
                Conversation.subject.in_(["Msg Owner", "Conv Owner", "Outbound Target", "Billing Inquiry", "Technical Support"])
            )
        )
        test_convs = (await session.execute(test_conv_stmt)).scalars().all()
        test_conv_ids = [c.id for c in test_convs]
        test_cust_ids_from_convs = [c.customer_id for c in test_convs]
        logger.info("Found %d test conversations to purge: %s", len(test_conv_ids), [str(i) for i in test_conv_ids])

        # 2. Delete messages in test conversations
        if test_conv_ids:
            del_msgs_stmt = delete(Message).where(Message.conversation_id.in_(test_conv_ids))
            del_msgs_res = await session.execute(del_msgs_stmt)
            logger.info("Deleted %d test messages.", del_msgs_res.rowcount or 0)

            # Delete conversations
            del_convs_stmt = delete(Conversation).where(Conversation.id.in_(test_conv_ids))
            del_convs_res = await session.execute(del_convs_stmt)
            logger.info("Deleted %d test conversations.", del_convs_res.rowcount or 0)
            await session.commit()

        # 3. Identify and delete test customers and orphan customers
        test_cust_stmt = select(Customer).where(
            or_(
                Customer.display_name.in_([
                    "Conv Owner", "Msg Owner", "Outbound Target", "Unsupported Target",
                    "Phase 3B Test User", "Meta Customer", "Cust A", "Cust B",
                    "Test Customer"
                ]),
                Customer.display_name.ilike("%smoke_test%"),
                Customer.display_name.ilike("%__TEST__%"),
            )
        )
        test_custs = (await session.execute(test_cust_stmt)).scalars().all()
        target_cust_ids = set([c.id for c in test_custs] + test_cust_ids_from_convs)
        
        # Check which of these have no active conversations left
        active_conv_cust_ids = set((await session.execute(select(Conversation.customer_id).distinct())).scalars().all())
        orphaned_cust_ids = [cid for cid in target_cust_ids if cid not in active_conv_cust_ids]
        
        # Also check all customers in DB for any orphans
        all_custs = (await session.execute(select(Customer))).scalars().all()
        all_orphans = [c.id for c in all_custs if c.id not in active_conv_cust_ids]
        
        logger.info("Found %d orphaned customer profiles to purge.", len(all_orphans))
        if all_orphans:
            await session.execute(delete(CustomerIdentity).where(CustomerIdentity.customer_id.in_(all_orphans)))
            del_cust_res = await session.execute(delete(Customer).where(Customer.id.in_(all_orphans)))
            logger.info("Deleted %d orphaned customers and their identities.", del_cust_res.rowcount or 0)
            await session.commit()

        # 4. Final verification
        conv_cnt = (await session.execute(select(func.count(Conversation.id)))).scalar()
        msg_cnt = (await session.execute(select(func.count(Message.id)))).scalar()
        cust_cnt = (await session.execute(select(func.count(Customer.id)))).scalar()
        logger.info("=== Database Purge Complete ===")
        logger.info("Remaining in PostgreSQL: %d Conversations | %d Messages | %d Customers",
                    conv_cnt, msg_cnt, cust_cnt)

        # Print breakdown by brand
        brand_stmt = select(Conversation.brand, func.count(Conversation.id)).group_by(Conversation.brand)
        brand_rows = (await session.execute(brand_stmt)).all()
        logger.info("--- Active Clean Brands ---")
        for b, count in brand_rows:
            logger.info("  * %s: %d conversations", b, count)

if __name__ == "__main__":
    asyncio.run(purge())
