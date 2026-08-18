import uuid
from typing import Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, ConversationStatusEnum, ProviderEnum


class ConversationService:
    @staticmethod
    async def create_conversation(
        session: AsyncSession,
        customer_id: uuid.UUID,
        provider: ProviderEnum,
        channel: ChannelEnum,
        external_conversation_id: str,
        subject: Optional[str] = None,
        status: ConversationStatusEnum = ConversationStatusEnum.OPEN,
    ) -> Conversation:
        conversation = Conversation(
            customer_id=customer_id,
            provider=provider,
            channel=channel,
            external_conversation_id=external_conversation_id,
            subject=subject,
            status=status,
        )
        session.add(conversation)
        await session.commit()
        await session.refresh(conversation)
        return conversation

    @staticmethod
    async def get_or_create_conversation_for_identity(
        session: AsyncSession,
        identity: CustomerIdentity,
        subject: Optional[str] = None,
    ) -> Conversation:
        # First check if customer ALREADY has an existing conversation thread
        stmt_cust = (
            select(Conversation)
            .where(Conversation.customer_id == identity.customer_id)
            .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
            .limit(1)
        )
        res_cust = await session.execute(stmt_cust)
        existing_cust_conv = res_cust.scalar_one_or_none()
        if existing_cust_conv:
            return existing_cust_conv

        ext_conv_id = f"resp_conv_{identity.external_user_id}"
        existing = await ConversationService.get_conversation_by_external_id(
            session=session,
            provider=identity.provider,
            channel=identity.channel,
            external_conversation_id=ext_conv_id,
        )
        if existing:
            return existing

        return await ConversationService.create_conversation(
            session=session,
            customer_id=identity.customer_id,
            provider=identity.provider,
            channel=identity.channel,
            external_conversation_id=ext_conv_id,
            subject=subject or f"Messenger Conversation ({identity.external_user_id})",
        )

    @staticmethod
    async def list_conversations(
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        customer_id: Optional[uuid.UUID] = None,
        provider: Optional[ProviderEnum] = None,
        channel: Optional[ChannelEnum] = None,
        status: Optional[ConversationStatusEnum] = None,
        search: Optional[str] = None,
    ) -> tuple[list[dict], int]:
        stmt = select(Conversation).options(selectinload(Conversation.customer))
        count_stmt = select(func.count(Conversation.id))

        if customer_id:
            stmt = stmt.where(Conversation.customer_id == customer_id)
            count_stmt = count_stmt.where(Conversation.customer_id == customer_id)
        if provider:
            stmt = stmt.where(Conversation.provider == provider)
            count_stmt = count_stmt.where(Conversation.provider == provider)
        if channel:
            stmt = stmt.where(Conversation.channel == channel)
            count_stmt = count_stmt.where(Conversation.channel == channel)
        if status:
            stmt = stmt.where(Conversation.status == status)
            count_stmt = count_stmt.where(Conversation.status == status)
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(Conversation.subject.ilike(term))
            count_stmt = count_stmt.where(Conversation.subject.ilike(term))

        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = (
            stmt.order_by(
                Conversation.last_message_at.desc().nullslast(),
                Conversation.created_at.desc(),
                Conversation.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await session.execute(stmt)
        conversations = list(res.scalars().all())

        items = []
        for conv in conversations:
            cust = conv.customer
            cust_name = cust.display_name if cust and cust.display_name else "مستخدم Messenger"
            cust_avatar = cust.avatar_url if cust and cust.avatar_url else None
            unread_cnt = getattr(conv, 'unread_count', 0) or 0
            agent_id = getattr(conv, 'assigned_agent_id', None)
            prio = getattr(conv, 'priority', "normal") or "normal"
            last_text = getattr(conv, 'last_message_text', "") or ""

            item = {
                "id": conv.id,
                "external_conversation_id": conv.external_conversation_id,
                "provider": conv.provider,
                "channel": conv.channel,
                "subject": conv.subject,
                "status": conv.status,
                "priority": prio,
                "assigned_agent_id": agent_id,
                "unread_count": unread_cnt,
                "customer_id": conv.customer_id,
                "customer_display_name": cust_name,
                "customer_avatar_url": cust_avatar,
                "last_message_text": last_text,
                "last_message_at": conv.last_message_at,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
            }
            items.append(item)

        return items, total

    @staticmethod
    async def get_conversation_by_id(
        session: AsyncSession, conversation_id: uuid.UUID
    ) -> Optional[Conversation]:
        stmt = (
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(
                selectinload(Conversation.customer),
                selectinload(Conversation.messages),
            )
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_conversation_detail(
        session: AsyncSession, conversation_id: uuid.UUID
    ) -> Optional[dict]:
        stmt = (
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(
                selectinload(Conversation.customer).selectinload(Customer.identities),
            )
        )
        result = await session.execute(stmt)
        conv = result.scalar_one_or_none()

        if not conv:
            return None

        customer_obj = conv.customer
        identities = customer_obj.identities if customer_obj else []

        return {
            "id": conv.id,
            "customer_id": conv.customer_id,
            "customer_display_name": customer_obj.display_name if customer_obj else None,
            "provider": conv.provider,
            "channel": conv.channel,
            "external_conversation_id": conv.external_conversation_id,
            "subject": conv.subject,
            "status": conv.status,
            "created_at": conv.created_at,
            "updated_at": conv.updated_at,
            "last_message_at": conv.last_message_at,
            "customer": customer_obj,
            "identities": identities,
        }

    @staticmethod
    async def get_conversation_by_external_id(
        session: AsyncSession,
        provider: ProviderEnum,
        channel: ChannelEnum,
        external_conversation_id: str,
    ) -> Optional[Conversation]:
        stmt = (
            select(Conversation)
            .where(
                Conversation.provider == provider,
                Conversation.channel == channel,
                Conversation.external_conversation_id == external_conversation_id,
            )
            .options(
                selectinload(Conversation.customer),
                selectinload(Conversation.messages),
            )
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_conversations_for_customer(
        session: AsyncSession, customer_id: uuid.UUID
    ) -> list[Conversation]:
        stmt = (
            select(Conversation)
            .where(Conversation.customer_id == customer_id)
            .order_by(Conversation.last_message_at.desc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())
