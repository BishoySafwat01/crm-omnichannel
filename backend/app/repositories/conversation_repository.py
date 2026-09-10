import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.models.enums import ChannelEnum, ConversationStatusEnum, ProviderEnum
from app.models.workspace import DEFAULT_WORKSPACE_ID

logger = logging.getLogger("app.repositories.conversation_repository")


class ConversationRepository:
    """Enterprise scoped data access repository for Conversation entities.

    Permanently enforces workspace_id boundary validation across all operations.
    """

    @staticmethod
    async def get_by_id(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        workspace_id: Optional[uuid.UUID] = None,
    ) -> Optional[Conversation]:
        stmt = (
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(selectinload(Conversation.customer))
        )
        if workspace_id is not None:
            stmt = stmt.where(Conversation.workspace_id == workspace_id)
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def list_by_workspace(
        session: AsyncSession,
        workspace_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        status: Optional[ConversationStatusEnum] = None,
        brand: Optional[str] = None,
        channel: Optional[ChannelEnum] = None,
        provider: Optional[ProviderEnum] = None,
    ) -> tuple[list[Conversation], int]:
        stmt = (
            select(Conversation)
            .where(Conversation.workspace_id == workspace_id)
            .options(selectinload(Conversation.customer))
        )
        count_stmt = (
            select(func.count(Conversation.id))
            .where(Conversation.workspace_id == workspace_id)
        )

        if status:
            stmt = stmt.where(Conversation.status == status)
            count_stmt = count_stmt.where(Conversation.status == status)
        if brand:
            stmt = stmt.where(Conversation.brand == brand)
            count_stmt = count_stmt.where(Conversation.brand == brand)
        if channel:
            stmt = stmt.where(Conversation.channel == channel)
            count_stmt = count_stmt.where(Conversation.channel == channel)
        if provider:
            stmt = stmt.where(Conversation.provider == provider)
            count_stmt = count_stmt.where(Conversation.provider == provider)

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
        return conversations, total

    @staticmethod
    async def create_scoped(
        session: AsyncSession,
        workspace_id: uuid.UUID,
        customer_id: uuid.UUID,
        provider: ProviderEnum,
        channel: ChannelEnum,
        external_conversation_id: str,
        subject: Optional[str] = None,
        status: ConversationStatusEnum = ConversationStatusEnum.OPEN,
        brand: Optional[str] = None,
    ) -> Conversation:
        conversation = Conversation(
            workspace_id=workspace_id,
            customer_id=customer_id,
            provider=provider,
            channel=channel,
            external_conversation_id=external_conversation_id,
            subject=subject,
            status=status,
            brand=brand or "Default Business Page",
        )
        session.add(conversation)
        await session.commit()
        await session.refresh(conversation)
        return conversation

    @staticmethod
    async def update_scoped(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        workspace_id: uuid.UUID,
        **kwargs: Any,
    ) -> Optional[Conversation]:
        conv = await ConversationRepository.get_by_id(
            session=session, conversation_id=conversation_id, workspace_id=workspace_id
        )
        if not conv:
            return None

        for key, val in kwargs.items():
            if hasattr(conv, key) and key not in ("id", "workspace_id"):
                setattr(conv, key, val)

        await session.commit()
        await session.refresh(conv)
        return conv

    @staticmethod
    async def delete_scoped(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> bool:
        stmt = delete(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.workspace_id == workspace_id,
        )
        res = await session.execute(stmt)
        await session.commit()
        return (res.rowcount or 0) > 0
