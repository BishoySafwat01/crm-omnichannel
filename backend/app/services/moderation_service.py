import os
import re
import json
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.audit_service import AuditService

logger = logging.getLogger("ModerationService")

DEFAULT_BAD_WORDS = [
    # سباب وشتائم
    "كلب", "حيوان", "غبي", "حمار", "يا حيوان", "يا كلب", "يا غبي", "زفت",
    "قذر", "سافل", "حقير", "وسخ", "ابن الكلب", "يلعن", "لعنة", "لعنك",
    "تفو", "منحط", "تافه", "نصاب", "حرامي", "سرقة", "نصب", "احتيال",
    "فاشل", "يا فاشل", "كذاب", "يا كذاب", "حقراء", "سفلة", "وقح",
    # كلمات منافسين أو تحذيرية
    "اشتري من برة", "ارخص منكم", "نصابين", "شركة نصابة"
]

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(STORAGE_DIR, exist_ok=True)
CONFIG_FILE_PATH = os.path.join(STORAGE_DIR, "moderation_config.json")


class ModerationService:
    _cached_config: Optional[Dict[str, Any]] = None

    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        """Read moderation config from disk or return default."""
        if os.path.exists(CONFIG_FILE_PATH):
            try:
                with open(CONFIG_FILE_PATH, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    cls._cached_config = cfg
                    return cfg
            except Exception as e:
                logger.error(f"Error reading moderation config: {e}")

        if cls._cached_config is not None:
            return cls._cached_config

        # Default configuration
        default_cfg = {
            "is_active": True,
            "bad_words": DEFAULT_BAD_WORDS,
            "notify_admin_toast": True,
            "notify_admin_email": True,
            "admin_alert_email": "luxiraholding@gmail.com",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        cls._cached_config = default_cfg
        cls.save_config(default_cfg)
        return default_cfg

    @classmethod
    def save_config(cls, config: Dict[str, Any]) -> Dict[str, Any]:
        """Save moderation configuration."""
        config["updated_at"] = datetime.now(timezone.utc).isoformat()
        cls._cached_config = config
        try:
            with open(CONFIG_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            logger.info("✅ [ModerationService] Moderation config successfully saved.")
        except Exception as e:
            logger.error(f"Error writing moderation config: {e}")
        return config

    @classmethod
    def normalize_arabic_text(cls, text: str) -> str:
        """Normalize Arabic characters, remove excessive repeating characters and punctuation."""
        if not text:
            return ""
        # 1. Remove diacritics / tashkeel
        tashkeel_regex = re.compile(r"[\u0617-\u061A\u064B-\u0652]")
        cleaned = tashkeel_regex.sub("", text)

        # 2. Normalize Alef forms (أ، إ، آ -> ا) and Teh Marbuta (ة -> ه) and Yaa (ى -> ي)
        cleaned = re.sub(r"[إأآا]", "ا", cleaned)
        cleaned = re.sub(r"ة", "ه", cleaned)
        cleaned = re.sub(r"ى", "ي", cleaned)

        # 3. Collapse character repetitions (e.g. حماااار -> حمار)
        cleaned = re.sub(r"(.)\1{2,}", r"\1", cleaned)

        return cleaned.lower()

    @classmethod
    def scan_for_bad_words(cls, text: Optional[str]) -> List[str]:
        """Scan text and return any matched prohibited bad words."""
        if not text or not text.strip():
            return []

        config = cls.get_config()
        if not config.get("is_active", True):
            return []

        bad_words = config.get("bad_words", [])
        if not bad_words:
            return []

        normalized_text = cls.normalize_arabic_text(text)
        matches = []

        for word in bad_words:
            if not word or not word.strip():
                continue
            norm_word = cls.normalize_arabic_text(word.strip())
            # Check for word boundary or substring match
            pattern = re.compile(rf"(?:\b|\s|^){re.escape(norm_word)}(?:\b|\s|$)", re.IGNORECASE)
            if pattern.search(normalized_text) or norm_word in normalized_text:
                matches.append(word.strip())

        return list(set(matches))

    @classmethod
    async def handle_detected_bad_words(
        cls,
        session: AsyncSession,
        matched_words: List[str],
        message_text: str,
        sender_type: str,
        sender_name: str,
        sender_id: Optional[str],
        conversation_id: uuid.UUID,
        customer_name: str,
        brand_name: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> None:
        """Record audit log and trigger real-time Red Alert to Admins."""
        if not matched_words:
            return

        now_utc = datetime.now(timezone.utc)
        words_str = "، ".join(matched_words)

        logger.warning(
            f"🚨 [Moderation Engine] Bad words detected in conversation {conversation_id}: [{words_str}] "
            f"by {sender_name} ({sender_type})"
        )

        # 1. Audit Log (Logged for ALL roles: Admin, Agent, Customer)
        try:
            u_id = None
            if sender_id and sender_type != "customer":
                try:
                    u_id = uuid.UUID(str(sender_id))
                except Exception:
                    u_id = None

            await AuditService.log_action(
                session=session,
                user_id=u_id,
                action="moderation.bad_word_detected",
                resource_type="conversation",
                resource_id=str(conversation_id),
                payload={
                    "conversation_id": str(conversation_id),
                    "customer_name": customer_name,
                    "sender_type": sender_type,
                    "sender_name": sender_name,
                    "matched_words": matched_words,
                    "message_text": message_text,
                    "brand": brand_name,
                    "channel": channel,
                    "detected_at": now_utc.isoformat(),
                },
            )
        except Exception as e:
            logger.error(f"Failed to log moderation audit: {e}", exc_info=True)

        # 2. Real-time WebSocket Red Alert
        try:
            from app.api.v1.ws import manager
            words_joined = "-".join([w.replace(" ", "_") for w in matched_words])
            alert_id = f"mod-{conversation_id}-{words_joined}"
            alert_payload = {
                "type": "ADMIN_SECURITY_ALERT",
                "id": alert_id,
                "alert_type": "bad_word_detected",
                "severity": "high",
                "title": f"⚠️ رصد كلمة محظورة ({words_str})",
                "actor_name": sender_name,
                "actor_type": sender_type,
                "matched_words": matched_words,
                "content_snippet": message_text,
                "conversation_id": str(conversation_id),
                "customer_name": customer_name,
                "brand_name": brand_name,
                "channel": channel,
                "timestamp": now_utc.isoformat(),
            }
            await manager.broadcast(alert_payload)
        except Exception as ws_err:
            logger.error(f"Error broadcasting bad word security alert: {ws_err}", exc_info=True)

        # 3. Asynchronous Email Alert to Admin
        try:
            from app.services.email_service import EmailService
            mod_cfg = cls.get_config()
            admin_email = mod_cfg.get("admin_alert_email") or os.getenv("ADMIN_ALERT_EMAIL", "admin@luxira.com")
            if mod_cfg.get("notify_admin_email", True) and admin_email:
                asyncio.create_task(
                    EmailService.send_bad_word_alert(
                        admin_email=admin_email,
                        sender_name=sender_name,
                        sender_role=sender_type,
                        matched_words=matched_words,
                        message_text=message_text,
                        conversation_id=str(conversation_id),
                        customer_name=customer_name,
                        brand_name=brand_name,
                        channel=channel,
                        detected_at=now_utc,
                    )
                )
        except Exception as email_err:
            logger.error(f"Error dispatching bad word email alert: {email_err}")
