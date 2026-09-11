import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

logger = logging.getLogger("test_context")


async def purge_test_fixtures(test_prefix: str = "__TEST__") -> dict[str, int]:
    """
    Surgically removes all test-generated messages, conversations, customers,
    and identities from the database without touching genuine client records.
    """
    async with AsyncSessionLocal() as session:
        # Delete test messages
        del_msgs = await session.execute(
            text(
                "DELETE FROM messages WHERE external_message_id LIKE :p1 "
                "OR external_message_id LIKE 'test_%' "
                "OR external_message_id LIKE 'smoke_test_%' "
                "OR external_message_id LIKE 'mid_smoke_%' "
                "OR external_message_id LIKE 'mid_test_%' "
                "OR external_message_id LIKE 'mid_mock_%';"
            ),
            {"p1": f"{test_prefix}%"},
        )
        msg_count = del_msgs.rowcount or 0

        # Delete test conversations
        del_convs = await session.execute(
            text(
                "DELETE FROM conversations WHERE external_conversation_id LIKE :p1 "
                "OR external_conversation_id LIKE 'test_%' "
                "OR external_conversation_id LIKE 'smoke_test_%' "
                "OR external_conversation_id LIKE 'resp_conv_smoke_%' "
                "OR external_conversation_id LIKE 'resp_conv_test_%' "
                "OR external_conversation_id LIKE :p2 "
                "OR external_conversation_id IN ('conv_filter_1', 'conv_filter_2', 'conv_msg_hist', 't_outbound_api_conv', 'conv_unsupported_tiktok', 't_fail_api_conv', 't_p3b_legacy_conv', 'conv_unique_123') "
                "OR brand = 'LAVVA' "
                "OR subject IN ('Msg Owner', 'Conv Owner', 'Outbound Target', 'Billing Inquiry', 'Technical Support');"
            ),
            {"p1": f"{test_prefix}%", "p2": f"resp_conv_{test_prefix}%"},
        )
        conv_count = del_convs.rowcount or 0

        # Delete test customers & identities
        del_custs = await session.execute(
            text(
                "DELETE FROM customers WHERE display_name LIKE :p1 "
                "OR display_name LIKE 'test_%' "
                "OR display_name LIKE 'smoke_test_%' "
                "OR display_name IN ('Conv Owner', 'Msg Owner', 'Outbound Target', 'Unsupported Target', 'Phase 3B Test User', 'Meta Customer', 'Cust A', 'Cust B', 'Test Customer');"
            ),
            {"p1": f"{test_prefix}%"},
        )
        cust_count = del_custs.rowcount or 0

        # Delete orphaned customer records
        del_orphans = await session.execute(
            text(
                "DELETE FROM customers WHERE id NOT IN (SELECT DISTINCT customer_id FROM conversations);"
            )
        )
        orphan_count = del_orphans.rowcount or 0

        # Delete test users
        del_users = await session.execute(
            text(
                "DELETE FROM users WHERE "
                "email LIKE '%@luxira.internal' "
                "OR email LIKE '%@test%' "
                "OR email LIKE '%_test@%' "
                "OR email LIKE 'test_%' "
                "OR email IN ('agent_test@luxira.com', 'admin_subscribe@luxira.com', 'admin_fail@luxira.com');"
            )
        )
        user_count = del_users.rowcount or 0

        await session.commit()
        
        logger.info(
            "[Teardown] Purged: %d messages, %d conversations, %d customers (%d orphans), %d users",
            msg_count, conv_count, cust_count, orphan_count, user_count
        )
        return {
            "messages": msg_count,
            "conversations": conv_count,
            "customers": cust_count + orphan_count,
            "users": user_count,
        }


@asynccontextmanager
async def managed_test_context(test_prefix: str = "__TEST__") -> AsyncGenerator[str, None]:
    """
    Async context manager for smoke/verification scripts.
    Guarantees automated cleanup of all test entities upon completion or failure.
    """
    logger.info("[TestContext] Starting managed test scope with prefix '%s'", test_prefix)
    try:
        # Pre-cleanup in case previous run was aborted
        await purge_test_fixtures(test_prefix=test_prefix)
        yield test_prefix
    finally:
        # Guaranteed post-cleanup teardown
        logger.info("[TestContext] Executing automated teardown for prefix '%s'", test_prefix)
        await purge_test_fixtures(test_prefix=test_prefix)
