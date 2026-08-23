import math
import uuid
from typing import Any, AsyncGenerator, Optional
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, ProviderEnum, SenderTypeEnum
from app.models.message import Message
from app.models.user import User


class CustomerService:
    @staticmethod
    async def create_customer(
        session: AsyncSession,
        display_name: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> Customer:
        customer = Customer(
            display_name=display_name,
            email=email,
            phone=phone,
        )
        session.add(customer)
        await session.commit()
        await session.refresh(customer)
        return customer

    @staticmethod
    async def list_customers(
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
    ) -> tuple[list[Customer], int]:
        stmt = select(Customer)
        count_stmt = select(func.count(Customer.id))

        if search and search.strip():
            term = f"%{search.strip()}%"
            where_clause = or_(
                Customer.display_name.ilike(term),
                Customer.email.ilike(term),
                Customer.phone.ilike(term),
            )
            stmt = stmt.where(where_clause)
            count_stmt = count_stmt.where(where_clause)

        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = (
            stmt.order_by(Customer.last_activity_at.desc(), Customer.created_at.desc(), Customer.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await session.execute(stmt)
        customers = list(res.scalars().all())
        return customers, total

    @staticmethod
    async def search_customers_advanced(
        session: AsyncSession,
        query: Optional[str] = None,
        brand: Optional[str] = None,
        tier: Optional[str] = None,
        skin_type: Optional[str] = None,
        stage: Optional[str] = None,
        country: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict[str, Any]], int, int]:
        stmt = select(Customer)
        count_stmt = select(func.count(Customer.id))
        conditions = []

        if stage and stage.strip() and stage.strip().lower() not in ("all", "الكل"):
            conditions.append(Customer.stage == stage.strip())

        if tier and tier.strip() and tier.strip().lower() not in ("all", "الكل"):
            conditions.append(Customer.tier == tier.strip())

        if skin_type and skin_type.strip() and skin_type.strip().lower() not in ("all", "الكل"):
            conditions.append(Customer.skin_type == skin_type.strip())

        if country and country.strip() and country.strip().lower() not in ("all", "الكل"):
            conditions.append(Customer.location.ilike(f"%{country.strip()}%"))

        if brand and brand.strip() and brand.strip().lower() not in ("all", "الكل"):
            brand_sub = select(Conversation.customer_id).where(Conversation.brand == brand.strip())
            conditions.append(Customer.id.in_(brand_sub))

        if query and query.strip():
            term = f"%{query.strip()}%"
            conditions.append(
                or_(
                    Customer.display_name.ilike(term),
                    Customer.phone.ilike(term),
                    Customer.email.ilike(term),
                )
            )

        for cond in conditions:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0
        total_pages = math.ceil(total / max(page_size, 1)) if total > 0 else 1

        stmt = (
            stmt.order_by(Customer.last_activity_at.desc(), Customer.created_at.desc(), Customer.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await session.execute(stmt)
        customers = list(res.scalars().all())

        if not customers:
            return [], total, total_pages

        cust_ids = [c.id for c in customers]

        # 1. Fetch conversations for these customers ordered by last_activity_at desc
        conv_stmt = (
            select(Conversation)
            .where(Conversation.customer_id.in_(cust_ids))
            .order_by(Conversation.last_activity_at.desc(), Conversation.created_at.desc())
        )
        conv_res = await session.execute(conv_stmt)
        convs = list(conv_res.scalars().all())

        customer_latest_conv = {}
        all_agent_ids = set()
        conv_ids = []
        for conv in convs:
            if conv.customer_id not in customer_latest_conv:
                customer_latest_conv[conv.customer_id] = conv
                conv_ids.append(conv.id)
            if conv.assigned_agent_id:
                try:
                    all_agent_ids.add(uuid.UUID(conv.assigned_agent_id))
                except ValueError:
                    pass

        # 2. Fetch latest outgoing agent messages for these conversations
        latest_agent_messages = {}
        if conv_ids:
            msg_stmt = (
                select(Message)
                .options(selectinload(Message.sender_user))
                .where(
                    Message.conversation_id.in_(conv_ids),
                    Message.sender_type == SenderTypeEnum.AGENT,
                )
                .order_by(Message.created_at.desc())
            )
            msg_res = await session.execute(msg_stmt)
            for msg in msg_res.scalars().all():
                if msg.conversation_id not in latest_agent_messages:
                    latest_agent_messages[msg.conversation_id] = msg
                if msg.sender_user_id:
                    all_agent_ids.add(msg.sender_user_id)

        # 3. Load Agent User details
        users_map = {}
        if all_agent_ids:
            user_stmt = select(User).where(User.id.in_(all_agent_ids))
            user_res = await session.execute(user_stmt)
            for u in user_res.scalars().all():
                users_map[str(u.id)] = u.full_name

        # 4. Construct enriched customer records
        enriched_items = []
        for c in customers:
            conv = customer_latest_conv.get(c.id)
            brand_val = getattr(conv, "brand", "LAVVA") if conv else "LAVVA"
            chan_val = (conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)) if conv else None
            conv_id = conv.id if conv else None
            conv_status = (conv.status.value if hasattr(conv.status, "value") else str(conv.status)) if conv else None
            assigned_id = conv.assigned_agent_id if conv else None
            assigned_name = users_map.get(str(conv.assigned_agent_id)) if conv and conv.assigned_agent_id else None

            latest_msg = latest_agent_messages.get(conv.id) if conv else None
            last_agent_name = None
            if latest_msg:
                if latest_msg.sender_user and latest_msg.sender_user.full_name:
                    last_agent_name = latest_msg.sender_user.full_name
                elif latest_msg.sender_user_id:
                    last_agent_name = users_map.get(str(latest_msg.sender_user_id))

            last_act = (conv.last_activity_at or conv.last_message_at or c.last_activity_at or c.created_at) if conv else (c.last_activity_at or c.created_at)

            item_dict = {
                "id": c.id,
                "display_name": c.display_name,
                "email": c.email,
                "phone": c.phone,
                "avatar_url": c.avatar_url,
                "location": c.location,
                "country": c.country,
                "city": c.city,
                "tier": c.tier,
                "skin_type": c.skin_type,
                "stage": c.stage,
                "locale": c.locale,
                "tags": c.tags or [],
                "created_at": c.created_at,
                "updated_at": c.updated_at,
                "last_activity_at": last_act,
                "brand": brand_val,
                "channel": chan_val,
                "conversation_id": conv_id,
                "conversation_status": conv_status,
                "assigned_agent_id": assigned_id,
                "assigned_agent_name": assigned_name,
                "last_agent_name": last_agent_name,
                "last_interaction": latest_msg.text if latest_msg else None,
            }
            enriched_items.append(item_dict)

        return enriched_items, total, total_pages

    @staticmethod
    async def stream_customers_csv(
        session: AsyncSession,
        brand: Optional[str] = None,
        stage: Optional[str] = None,
        tier: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        def csv_escape(val: Any) -> str:
            if val is None:
                return '""'
            val_str = str(val).replace('"', '""')
            return f'"{val_str}"'

        # Yield UTF-8 BOM prefix for Excel Arabic character rendering
        yield "\ufeffID,Name,Phone,Email,Location,Tier,Skin Type,Stage,Created At\n"

        batch_size = 500
        offset = 0

        conditions = []
        if stage and stage.strip() and stage.strip().lower() not in ("all", "الكل"):
            conditions.append(Customer.stage == stage.strip())
        if tier and tier.strip() and tier.strip().lower() not in ("all", "الكل"):
            conditions.append(Customer.tier == tier.strip())
        if brand and brand.strip() and brand.strip().lower() not in ("all", "الكل"):
            brand_sub = select(Conversation.customer_id).where(Conversation.brand == brand.strip())
            conditions.append(Customer.id.in_(brand_sub))

        while True:
            stmt = select(Customer)
            for cond in conditions:
                stmt = stmt.where(cond)

            stmt = stmt.order_by(Customer.created_at.desc(), Customer.id.desc()).offset(offset).limit(batch_size)
            res = await session.execute(stmt)
            rows = list(res.scalars().all())

            if not rows:
                break

            for c in rows:
                line = (
                    f"{csv_escape(c.id)},"
                    f"{csv_escape(c.display_name or '')},"
                    f"{csv_escape(c.phone or '')},"
                    f"{csv_escape(c.email or '')},"
                    f"{csv_escape(c.location or '')},"
                    f"{csv_escape(c.tier or '')},"
                    f"{csv_escape(c.skin_type or '')},"
                    f"{csv_escape(c.stage or '')},"
                    f"{csv_escape(c.created_at.isoformat() if c.created_at else '')}\n"
                )
                yield line

            offset += len(rows)
            if len(rows) < batch_size:
                break

    @staticmethod
    async def get_customer_stats(session: AsyncSession) -> dict[str, Any]:
        tot_stmt = select(func.count(Customer.id))
        total = (await session.execute(tot_stmt)).scalar() or 0

        stage_stmt = select(Customer.stage, func.count(Customer.id)).group_by(Customer.stage)
        stage_rows = (await session.execute(stage_stmt)).all()
        stages = [{"stage": r[0] or "جديد", "count": r[1]} for r in stage_rows]

        tier_stmt = select(Customer.tier, func.count(Customer.id)).group_by(Customer.tier)
        tier_rows = (await session.execute(tier_stmt)).all()
        tiers = [{"tier": r[0] or "درجة أولى", "count": r[1]} for r in tier_rows]

        return {
            "total_customers": total,
            "stages": stages,
            "tiers": tiers,
        }

    @staticmethod
    async def get_customer_by_id(
        session: AsyncSession, customer_id: uuid.UUID
    ) -> Optional[Customer]:
        stmt = (
            select(Customer)
            .where(Customer.id == customer_id)
            .options(
                selectinload(Customer.identities),
                selectinload(Customer.conversations),
            )
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_customer_detail_by_id(
        session: AsyncSession, customer_id: uuid.UUID
    ) -> Optional[dict[str, Any]]:
        customer = await CustomerService.get_customer_by_id(session=session, customer_id=customer_id)
        if not customer:
            return None

        # Fetch latest active conversation
        conv_stmt = (
            select(Conversation)
            .where(Conversation.customer_id == customer_id)
            .order_by(Conversation.last_activity_at.desc(), Conversation.created_at.desc())
            .limit(1)
        )
        conv_res = await session.execute(conv_stmt)
        conv = conv_res.scalar_one_or_none()

        brand_val = getattr(conv, "brand", "LAVVA") if conv else "LAVVA"
        chan_val = (conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)) if conv else None
        conv_id = conv.id if conv else None
        conv_status = (conv.status.value if hasattr(conv.status, "value") else str(conv.status)) if conv else None
        assigned_id = conv.assigned_agent_id if conv else None
        assigned_name = None
        if assigned_id:
            try:
                agent_u = await session.get(User, uuid.UUID(assigned_id))
                if agent_u:
                    assigned_name = agent_u.full_name
            except ValueError:
                pass

        last_agent_name = None
        last_interaction = None
        if conv:
            msg_stmt = (
                select(Message)
                .options(selectinload(Message.sender_user))
                .where(
                    Message.conversation_id == conv.id,
                    Message.sender_type == SenderTypeEnum.AGENT,
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            msg_res = await session.execute(msg_stmt)
            latest_msg = msg_res.scalar_one_or_none()
            if latest_msg:
                last_interaction = latest_msg.text
                if latest_msg.sender_user:
                    last_agent_name = latest_msg.sender_user.full_name

        last_act = (conv.last_activity_at or conv.last_message_at or customer.last_activity_at or customer.created_at) if conv else (customer.last_activity_at or customer.created_at)

        return {
            "id": customer.id,
            "display_name": customer.display_name,
            "email": customer.email,
            "phone": customer.phone,
            "avatar_url": customer.avatar_url,
            "location": customer.location,
            "country": customer.country,
            "city": customer.city,
            "tier": customer.tier,
            "skin_type": customer.skin_type,
            "stage": customer.stage,
            "locale": customer.locale,
            "tags": customer.tags or [],
            "identities": customer.identities or [],
            "created_at": customer.created_at,
            "updated_at": customer.updated_at,
            "last_activity_at": last_act,
            "brand": brand_val,
            "channel": chan_val,
            "conversation_id": conv_id,
            "conversation_status": conv_status,
            "assigned_agent_id": assigned_id,
            "assigned_agent_name": assigned_name,
            "last_agent_name": last_agent_name,
            "last_interaction": last_interaction,
        }

    @staticmethod
    async def get_customer_identities(
        session: AsyncSession, customer_id: uuid.UUID
    ) -> Optional[list[CustomerIdentity]]:
        cust_stmt = select(Customer).where(Customer.id == customer_id)
        cust_res = await session.execute(cust_stmt)
        if not cust_res.scalar_one_or_none():
            return None

        stmt = (
            select(CustomerIdentity)
            .where(CustomerIdentity.customer_id == customer_id)
            .order_by(CustomerIdentity.created_at.desc())
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def add_identity(
        session: AsyncSession,
        customer_id: uuid.UUID,
        provider: ProviderEnum,
        channel: ChannelEnum,
        external_user_id: str,
        metadata_: Optional[dict[str, Any]] = None,
    ) -> CustomerIdentity:
        identity = CustomerIdentity(
            customer_id=customer_id,
            provider=provider,
            channel=channel,
            external_user_id=external_user_id,
            metadata_=metadata_ or {},
        )
        session.add(identity)
        await session.commit()
        await session.refresh(identity)
        return identity

    @staticmethod
    async def find_customer_by_identity(
        session: AsyncSession,
        provider: ProviderEnum,
        channel: ChannelEnum,
        external_user_id: str,
    ) -> Optional[Customer]:
        stmt = (
            select(Customer)
            .join(Customer.identities)
            .where(
                CustomerIdentity.provider == provider,
                CustomerIdentity.channel == channel,
                CustomerIdentity.external_user_id == external_user_id,
            )
            .options(selectinload(Customer.identities))
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_or_create_customer_with_identity(
        session: AsyncSession,
        provider: ProviderEnum,
        channel: ChannelEnum,
        external_user_id: str,
        display_name: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        metadata_: Optional[dict[str, Any]] = None,
    ) -> tuple[Customer, CustomerIdentity]:
        existing_customer = await CustomerService.find_customer_by_identity(
            session, provider, channel, external_user_id
        )
        if existing_customer:
            stmt = select(CustomerIdentity).where(
                CustomerIdentity.customer_id == existing_customer.id,
                CustomerIdentity.provider == provider,
                CustomerIdentity.channel == channel,
                CustomerIdentity.external_user_id == external_user_id,
            )
            res = await session.execute(stmt)
            identity = res.scalar_one()
            return existing_customer, identity

        customer = Customer(display_name=display_name, email=email, phone=phone)
        session.add(customer)
        await session.flush()

        identity = CustomerIdentity(
            customer_id=customer.id,
            provider=provider,
            channel=channel,
            external_user_id=external_user_id,
            metadata_=metadata_ or {},
        )
        session.add(identity)
        await session.commit()
        await session.refresh(customer)
        await session.refresh(identity)
        return customer, identity

