import math
import uuid
from typing import Any, AsyncGenerator, Optional
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, ProviderEnum


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
            stmt.order_by(Customer.created_at.desc(), Customer.id.desc())
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
    ) -> tuple[list[Customer], int, int]:
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
            stmt.order_by(Customer.created_at.desc(), Customer.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await session.execute(stmt)
        customers = list(res.scalars().all())
        return customers, total, total_pages

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

    @staticmethod
    async def block_customer(
        session: AsyncSession,
        customer_id: uuid.UUID,
        reason: Optional[str] = None,
        admin_user_id: Optional[uuid.UUID] = None,
        admin_name: Optional[str] = None,
    ) -> Customer:
        customer = await session.get(Customer, customer_id)
        if not customer:
            raise ValueError("العميل غير موجود.")

        from datetime import datetime, timezone
        customer.is_blocked = True
        customer.blocked_at = datetime.now(timezone.utc)
        customer.blocked_reason = reason
        session.add(customer)

        # Log to Customer 360 Timeline
        try:
            from app.services.customer_timeline_service import CustomerTimelineService
            await CustomerTimelineService.record_event(
                session=session,
                customer_id=customer.id,
                event_type="customer.blocked",
                channel="admin",
                summary=f"تم حظر العميل بواسطة المشرف {admin_name or ''}".strip(),
                details={"reason": reason, "admin_user_id": str(admin_user_id) if admin_user_id else None},
            )
        except Exception:
            pass

        # Log User Audit
        try:
            from app.services.audit_service import AuditService
            await AuditService.record_audit_log(
                session=session,
                user_id=admin_user_id,
                action="CUSTOMER_BLOCKED",
                resource_type="customer",
                resource_id=str(customer_id),
                payload={"reason": reason},
            )
        except Exception:
            pass

        await session.commit()
        await session.refresh(customer)

        # Real-time WebSocket Broadcast
        try:
            from app.api.v1.ws import manager
            await manager.broadcast({
                "type": "CUSTOMER_BLOCKED",
                "customer_id": str(customer.id),
                "is_blocked": True,
                "blocked_reason": reason,
            })
        except Exception:
            pass

        return customer

    @staticmethod
    async def unblock_customer(
        session: AsyncSession,
        customer_id: uuid.UUID,
        admin_user_id: Optional[uuid.UUID] = None,
        admin_name: Optional[str] = None,
    ) -> Customer:
        customer = await session.get(Customer, customer_id)
        if not customer:
            raise ValueError("العميل غير موجود.")

        customer.is_blocked = False
        customer.blocked_at = None
        customer.blocked_reason = None
        session.add(customer)

        # Log to Customer 360 Timeline
        try:
            from app.services.customer_timeline_service import CustomerTimelineService
            await CustomerTimelineService.record_event(
                session=session,
                customer_id=customer.id,
                event_type="customer.unblocked",
                channel="admin",
                summary=f"تم إلغاء حظر العميل بواسطة المشرف {admin_name or ''}".strip(),
                details={"admin_user_id": str(admin_user_id) if admin_user_id else None},
            )
        except Exception:
            pass

        # Log User Audit
        try:
            from app.services.audit_service import AuditService
            await AuditService.record_audit_log(
                session=session,
                user_id=admin_user_id,
                action="CUSTOMER_UNBLOCKED",
                resource_type="customer",
                resource_id=str(customer_id),
                payload={},
            )
        except Exception:
            pass

        await session.commit()
        await session.refresh(customer)

        # Real-time WebSocket Broadcast
        try:
            from app.api.v1.ws import manager
            await manager.broadcast({
                "type": "CUSTOMER_UNBLOCKED",
                "customer_id": str(customer.id),
                "is_blocked": False,
            })
        except Exception:
            pass

        return customer

