import logging
import uuid
from typing import Any, Optional
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer_note import CustomerNote
from app.models.customer_timeline import CustomerTimelineEvent
from app.models.enums import UserRole
from app.models.user import User

logger = logging.getLogger(__name__)


class CustomerTimelineService:
    @staticmethod
    async def record_event(
        session: AsyncSession,
        customer_id: uuid.UUID,
        event_type: str,
        channel: str,
        summary: str,
        details: Optional[dict[str, Any]] = None,
    ) -> CustomerTimelineEvent:
        """Records a timeline event for Customer 360 interaction history."""
        event = CustomerTimelineEvent(
            customer_id=customer_id,
            event_type=event_type,
            channel=channel,
            summary=summary,
            details=details,
        )
        session.add(event)
        try:
            await session.flush()
        except Exception as e:
            logger.error("[CustomerTimelineService] Failed to record event: %s", e)
        return event

    @staticmethod
    async def add_note(
        session: AsyncSession,
        customer_id: uuid.UUID,
        author_user_id: Optional[uuid.UUID],
        text: str,
    ) -> CustomerNote:
        """Adds an internal agent note for a customer and logs a timeline event."""
        clean_text = (text or "").strip()
        if not clean_text:
            raise ValueError("Note text cannot be empty.")

        note = CustomerNote(
            customer_id=customer_id,
            author_user_id=author_user_id,
            text=clean_text,
        )
        session.add(note)
        await session.flush()

        # Log timeline event for note creation
        await CustomerTimelineService.record_event(
            session=session,
            customer_id=customer_id,
            event_type="note.created",
            channel="system",
            summary="ملاحظة جديدة مضافة من الفريق",
            details={
                "note_id": str(note.id),
                "author_user_id": str(author_user_id) if author_user_id else None,
                "text_snippet": clean_text[:100],
            },
        )

        await session.commit()
        await session.refresh(note)
        return note

    @staticmethod
    async def get_customer_timeline(
        session: AsyncSession,
        customer_id: uuid.UUID,
        page: int = 1,
        page_size: int = 30,
    ) -> dict[str, Any]:
        """Retrieves paginated Customer 360 timeline events ordered by created_at DESC."""
        count_stmt = select(func.count(CustomerTimelineEvent.id)).where(
            CustomerTimelineEvent.customer_id == customer_id
        )
        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0

        stmt = (
            select(CustomerTimelineEvent)
            .where(CustomerTimelineEvent.customer_id == customer_id)
            .order_by(CustomerTimelineEvent.created_at.desc(), CustomerTimelineEvent.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await session.execute(stmt)
        events = list(res.scalars().all())

        return {
            "items": events,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @staticmethod
    async def get_customer_notes(
        session: AsyncSession,
        customer_id: uuid.UUID,
    ) -> list[dict[str, Any]]:
        """Retrieves internal agent notes for a customer with author details."""
        stmt = (
            select(CustomerNote)
            .options(selectinload(CustomerNote.author_user))
            .where(CustomerNote.customer_id == customer_id)
            .order_by(CustomerNote.created_at.desc())
        )
        res = await session.execute(stmt)
        notes = list(res.scalars().all())

        result = []
        for n in notes:
            author_name = n.author_user.full_name if n.author_user else "موظف الدعم"
            result.append({
                "id": str(n.id),
                "customer_id": str(n.customer_id),
                "author_user_id": str(n.author_user_id) if n.author_user_id else None,
                "author_name": author_name,
                "text": n.text,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            })
        return result

    @staticmethod
    async def delete_note(
        session: AsyncSession,
        customer_id: uuid.UUID,
        note_id: uuid.UUID,
        requesting_user: Optional[User] = None,
    ) -> bool:
        """Deletes an internal note if caller is the author or holds an admin/supervisor role."""
        note = await session.get(CustomerNote, note_id)
        if not note or note.customer_id != customer_id:
            return False

        if requesting_user:
            role_val = requesting_user.role.value if hasattr(requesting_user.role, "value") else str(requesting_user.role)
            is_admin_or_super = role_val in (UserRole.ADMIN.value, UserRole.SUPERVISOR.value)
            is_author = note.author_user_id == requesting_user.id
            if not is_admin_or_super and not is_author:
                raise PermissionError("Not authorized to delete this note.")

        await session.delete(note)
        await session.commit()
        return True
