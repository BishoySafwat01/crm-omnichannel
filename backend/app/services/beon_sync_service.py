import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
import httpx
from sqlalchemy import delete, func, select, or_

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.integrations.beon.client import BeonClient
from app.integrations.beon.normalizer import BeonNormalizer
from app.models.enums import ChannelEnum, MessageTypeEnum, ProviderEnum, SenderTypeEnum
from app.models.customer import Customer, CustomerIdentity
from app.models.conversation import Conversation
from app.models.message import Message

logger = logging.getLogger("app.services.beon_sync")


class BeonSyncEngine:
    """Production Historical Synchronization Engine for BeOn V3."""

    def __init__(self, api_key: Optional[str] = None):
        self.client = BeonClient(api_key=api_key or settings.BEON_API_KEY)

    async def purge_synthetic_test_fixtures(self) -> dict[str, int]:
        """Purge all synthetic test conversations, test messages, and orphaned test customers."""
        stats = {"conversations_deleted": 0, "messages_deleted": 0, "customers_deleted": 0}

        async with AsyncSessionLocal() as db:
            # 1. Identify test customer IDs
            test_patterns = [
                "%Test Customer%",
                "%Priority Customer%",
                "%Conv Test%",
                "%Presence%",
                "%sara_ahmed%",
                "%(اختبار BeOn)%",
                "%Sarah Test%",
                "%Sarah Mohamed Ahmed%",
            ]
            filter_clauses = [Customer.display_name.ilike(p) for p in test_patterns]
            cust_stmt = select(Customer.id).where(or_(*filter_clauses))
            test_cust_ids = (await db.execute(cust_stmt)).scalars().all()

            # Also identify test conversations by external_conversation_id patterns
            conv_patterns = [
                "%test%",
                "%probe%",
                "%conv_live%",
                "%synthetic%",
            ]
            conv_filter_clauses = [Conversation.external_conversation_id.ilike(p) for p in conv_patterns]
            conv_stmt = select(Conversation.id).where(
                or_(
                    Conversation.customer_id.in_(test_cust_ids) if test_cust_ids else False,
                    *conv_filter_clauses
                )
            )
            test_conv_ids = (await db.execute(conv_stmt)).scalars().all()

            if test_conv_ids:
                # Delete messages
                del_msg = await db.execute(delete(Message).where(Message.conversation_id.in_(test_conv_ids)))
                stats["messages_deleted"] = del_msg.rowcount or 0

                # Delete conversations
                del_conv = await db.execute(delete(Conversation).where(Conversation.id.in_(test_conv_ids)))
                stats["conversations_deleted"] = del_conv.rowcount or 0

            if test_cust_ids:
                # Delete identities
                await db.execute(delete(CustomerIdentity).where(CustomerIdentity.customer_id.in_(test_cust_ids)))
                # Delete customers
                del_cust = await db.execute(delete(Customer).where(Customer.id.in_(test_cust_ids)))
                stats["customers_deleted"] = del_cust.rowcount or 0

            await db.commit()

        return stats

    async def sync_real_beon_data(self, max_pages: int = 5, per_page: int = 50) -> dict[str, Any]:
        """Fetch real conversations and messages directly from BeOn V3 and persist them."""
        results = {
            "total_synced_conversations": 0,
            "total_synced_messages": 0,
            "imported_conversations": [],
        }

        page = 1
        while page <= max_pages:
            logger.info(f"Fetching BeOn conversations page {page} (per_page={per_page})...")
            try:
                resp = await self.client.get_conversations(page=page, per_page=per_page)
            except Exception as e:
                logger.error(f"Error fetching page {page} from BeOn: {e}")
                break

            data_obj = resp.get("data") or {}
            records = data_obj.get("records") or []
            if not records:
                break

            for raw_conv in records:
                norm_conv = BeonNormalizer.normalize_conversation(raw_conv)
                ext_conv_id = norm_conv["external_conversation_id"]
                if not ext_conv_id:
                    continue

                async with AsyncSessionLocal() as db:
                    # 1. Upsert Customer
                    cust_phone = norm_conv.get("customer_phone")
                    cust_name = norm_conv.get("customer_name") or "عميل BeOn"
                    ext_cust_id = norm_conv.get("customer_external_id")

                    customer = None
                    if cust_phone:
                        cust_stmt = select(Customer).where(Customer.phone == cust_phone)
                        customer = (await db.execute(cust_stmt)).scalar_one_or_none()

                    if not customer and ext_cust_id:
                        ident_stmt = select(CustomerIdentity).where(
                            CustomerIdentity.provider == ProviderEnum.BEON,
                            CustomerIdentity.external_user_id == str(ext_cust_id),
                        )
                        ident = (await db.execute(ident_stmt)).scalar_one_or_none()
                        if ident:
                            customer = (await db.execute(select(Customer).where(Customer.id == ident.customer_id))).scalar_one_or_none()

                    if not customer:
                        customer = Customer(
                            id=uuid.uuid4(),
                            display_name=cust_name,
                            phone=cust_phone,
                            created_at=norm_conv["last_message_at"],
                            updated_at=norm_conv["last_message_at"],
                        )
                        db.add(customer)
                        await db.flush()
                    else:
                        if cust_name and (not customer.display_name or customer.display_name == "عميل BeOn"):
                            customer.display_name = cust_name
                        if cust_phone and not customer.phone:
                            customer.phone = cust_phone

                    # 2. Upsert Customer Identity
                    ident_stmt = select(CustomerIdentity).where(
                        CustomerIdentity.customer_id == customer.id,
                        CustomerIdentity.provider == ProviderEnum.BEON,
                        CustomerIdentity.external_user_id == str(ext_cust_id or cust_phone or ext_conv_id),
                    )
                    identity = (await db.execute(ident_stmt)).scalar_one_or_none()
                    if not identity:
                        identity = CustomerIdentity(
                            id=uuid.uuid4(),
                            customer_id=customer.id,
                            provider=ProviderEnum.BEON,
                            channel=norm_conv["channel"],
                            external_user_id=str(ext_cust_id or cust_phone or ext_conv_id),
                        )
                        db.add(identity)
                        await db.flush()

                    # 3. Upsert Conversation
                    conv_stmt = select(Conversation).where(
                        Conversation.provider == ProviderEnum.BEON,
                        Conversation.external_conversation_id == str(ext_conv_id),
                    )
                    conversation = (await db.execute(conv_stmt)).scalar_one_or_none()
                    if not conversation:
                        conversation = Conversation(
                            id=uuid.uuid4(),
                            customer_id=customer.id,
                            provider=ProviderEnum.BEON,
                            channel=norm_conv["channel"],
                            external_conversation_id=str(ext_conv_id),
                            brand=norm_conv["brand"],
                            status=norm_conv["status"],
                            last_message_at=norm_conv["last_message_at"],
                            last_activity_at=norm_conv["last_message_at"],
                            created_at=norm_conv["last_message_at"],
                            unread_count=0,
                        )
                        db.add(conversation)
                        await db.flush()
                        results["total_synced_conversations"] += 1
                        results["imported_conversations"].append({
                            "id": str(conversation.id),
                            "external_id": ext_conv_id,
                            "customer_name": cust_name,
                            "channel": norm_conv["channel"].value,
                            "brand": norm_conv["brand"],
                            "status": norm_conv["status"],
                            "last_message_at": str(norm_conv["last_message_at"]),
                        })
                    else:
                        conversation.customer_id = customer.id
                        conversation.brand = norm_conv["brand"]
                        conversation.last_message_at = norm_conv["last_message_at"]
                        conversation.last_activity_at = norm_conv["last_message_at"]

                    # 4. Fetch and Sync Messages for this Conversation
                    try:
                        msg_resp = await self.client.get_conversation_messages(ext_conv_id, per_page=50)
                        msg_records = (msg_resp.get("data") or {}).get("records") or []
                        for raw_msg in msg_records:
                            norm_msg = BeonNormalizer.normalize_message(raw_msg, conversation_external_id=ext_conv_id)
                            msg_ext_id = norm_msg["external_message_id"]

                            msg_check = await db.execute(
                                select(Message).where(
                                    Message.conversation_id == conversation.id,
                                    Message.external_message_id == msg_ext_id,
                                )
                            )
                            if not msg_check.scalar_one_or_none():
                                msg_obj = Message(
                                    id=uuid.uuid4(),
                                    conversation_id=conversation.id,
                                    external_message_id=msg_ext_id,
                                    sender_type=norm_msg["sender_type"],
                                    sender_external_id=norm_msg.get("sender_external_id"),
                                    message_type=norm_msg["message_type"],
                                    text=norm_msg["text"],
                                    metadata=norm_msg["metadata"],
                                    created_at=norm_msg["created_at"],
                                )
                                db.add(msg_obj)
                                results["total_synced_messages"] += 1
                    except Exception as msg_err:
                        logger.warning(f"Could not sync messages for conv {ext_conv_id}: {msg_err}")

                    await db.commit()

            meta = data_obj.get("meta") or {}
            last_page = meta.get("last_page", 1)
            if page >= last_page:
                break
            page += 1

        return results


async def main():
    print("=" * 80)
    print("STARTING BEON PURGE & REAL HISTORICAL SYNC")
    print("=" * 80)

    engine = BeonSyncEngine()

    # Step 1: Purge Synthetic Test Fixtures
    print("🧹 Purging synthetic test fixtures...")
    purge_stats = await engine.purge_synthetic_test_fixtures()
    print(f"✅ Deleted Test Conversations: {purge_stats['conversations_deleted']}")
    print(f"✅ Deleted Test Messages: {purge_stats['messages_deleted']}")
    print(f"✅ Deleted Test Customers: {purge_stats['customers_deleted']}")

    # Step 2: Real BeOn API Sync
    print("\n🌐 Executing Real BeOn Historical Sync against https://v3.api.beon.chat/api...")
    sync_results = await engine.sync_real_beon_data(max_pages=3, per_page=50)
    print(f"✅ Synced Conversations Count: {sync_results['total_synced_conversations']}")
    print(f"✅ Synced Messages Count: {sync_results['total_synced_messages']}")

    # Step 3: Print Top 10 Most Recent Real Conversations
    print("\n📋 Top 10 Active Real Conversations in PostgreSQL:")
    async with AsyncSessionLocal() as db:
        stmt = (
            select(Conversation, Customer)
            .join(Customer, Conversation.customer_id == Customer.id)
            .order_by(Conversation.last_message_at.desc())
            .limit(10)
        )
        recent_rows = (await db.execute(stmt)).all()
        for idx, (conv, cust) in enumerate(recent_rows, 1):
            print(f"  {idx}. [{conv.channel.value.upper()}] {cust.display_name} ({cust.phone or 'No phone'}) | Brand: {conv.brand} | Status: {conv.status} | Last Msg: {conv.last_message_at}")

    print("\n" + "=" * 80)
    print("🎉 REAL BEON HISTORICAL SYNC COMPLETE!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
