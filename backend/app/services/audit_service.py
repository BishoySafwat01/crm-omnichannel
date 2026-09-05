import logging
import uuid
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import ConversationAssignmentLog, UserAuditLog

logger = logging.getLogger("AuditService")

SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "authorization",
}


def sanitize_payload(obj: Any) -> Any:
    """Recursively strip sensitive keys (passwords, tokens, API keys) from audit payloads."""
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            if str(k).lower() in SENSITIVE_KEYS:
                cleaned[k] = "[REDACTED]"
            else:
                cleaned[k] = sanitize_payload(v)
        return cleaned
    elif isinstance(obj, list):
        return [sanitize_payload(item) for item in obj]
    elif isinstance(obj, uuid.UUID):
        return str(obj)
    return obj


class AuditService:
    @staticmethod
    async def log_action(
        session: AsyncSession,
        user_id: Optional[uuid.UUID],
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> Optional[UserAuditLog]:
        """Create and persist an immutable user audit log record with automatic sanitization."""
        try:
            safe_payload = sanitize_payload(payload) if payload else {}
            audit_entry = UserAuditLog(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id is not None else None,
                payload=safe_payload,
                ip_address=ip_address,
            )
            session.add(audit_entry)
            await session.commit()
            await session.refresh(audit_entry)
            return audit_entry
        except Exception as exc:
            logger.error("[AuditService] Failed to record UserAuditLog (%s on %s): %s", action, resource_type, exc)
            return None

    @staticmethod
    async def log_assignment(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        assigned_by_user_id: Optional[uuid.UUID],
        assigned_to_user_id: Optional[uuid.UUID],
        previous_agent_id: Optional[str] = None,
        reason: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> ConversationAssignmentLog:
        """Log a conversation assignment or unassignment event."""
        assignment_log = ConversationAssignmentLog(
            conversation_id=conversation_id,
            assigned_by_user_id=assigned_by_user_id,
            assigned_to_user_id=assigned_to_user_id,
            previous_agent_id=str(previous_agent_id) if previous_agent_id is not None else None,
            reason=reason,
        )
        session.add(assignment_log)

        action_name = "conversation.assigned" if assigned_to_user_id else "conversation.unassigned"
        audit_payload = {
            "conversation_id": str(conversation_id),
            "assigned_to_user_id": str(assigned_to_user_id) if assigned_to_user_id else None,
            "previous_agent_id": str(previous_agent_id) if previous_agent_id else None,
            "reason": reason,
        }

        audit_entry = UserAuditLog(
            user_id=assigned_by_user_id,
            action=action_name,
            resource_type="conversation",
            resource_id=str(conversation_id),
            payload=audit_payload,
            ip_address=ip_address,
        )
        session.add(audit_entry)

        try:
            await session.commit()
            await session.refresh(assignment_log)
        except Exception as exc:
            logger.error("[AuditService] Failed to commit assignment log: %s", exc)
            await session.rollback()

        return assignment_log
