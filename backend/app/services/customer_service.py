import uuid
from typing import Any, Optional
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
        # First check customer existence
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
