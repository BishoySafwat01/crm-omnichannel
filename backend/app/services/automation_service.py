import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import (
    AutomationExecutionLog,
    AutomationRule,
    AutomationSettings,
)
from app.models.connected_page import ConnectedPage
from app.models.conversation import Conversation
from app.models.customer import Customer
from app.models.enums import UserRole
from app.models.message import Message
from app.models.user import User

logger = logging.getLogger("AutomationEngine")


class AutomationAuthorizationError(ValueError):
    """Raised when a user attempts an unauthorized automation mutation."""


def normalize_arabic(text: Optional[str]) -> str:
    """Normalize Arabic text (alif, taa marbuta, emojis, spaces, diacritics) for robust keyword matching."""
    if not text:
        return ""
    t = text.lower()
    # 1. Normalize Alif variations
    t = re.sub(r"[إأآاٱ]", "ا", t)
    # 2. Normalize Taa Marbuta / Haa
    t = re.sub(r"ة", "ه", t)
    # 3. Normalize Yaa / Alif Maqsura
    t = re.sub(r"[ىيئ]", "ي", t)
    # 4. Remove Tashkeel (diacritics)
    t = re.sub(r"[\u064B-\u065F\u0670]", "", t)
    # 5. Remove Tatweel / Kashida
    t = re.sub(r"ـ", "", t)
    # 6. Remove emojis and special symbols, replace with single space
    t = re.sub(r"[^\w\s\u0600-\u06FF]", " ", t)
    # 7. Collapse spaces
    t = re.sub(r"\s+", " ", t).strip()
    return t


GLOBAL_AUTOMATION_REDIS_KEY = "crm:automation:global_enabled"
_in_memory_global_automation_enabled: bool = True


async def is_global_automation_enabled() -> bool:
    """Check if the global automation master switch is enabled via Redis cache with in-memory fallback."""
    global _in_memory_global_automation_enabled
    try:
        from app.core.redis import get_redis_client
        client = await get_redis_client()
        val = await client.get(GLOBAL_AUTOMATION_REDIS_KEY)
        if val is not None:
            return str(val).lower() in ("true", "1", "yes")
    except Exception as e:
        logger.warning("[Automation Engine] Redis check for global toggle failed (%s), using in-memory state: %s", e, _in_memory_global_automation_enabled)
    return _in_memory_global_automation_enabled


async def set_global_automation_enabled(enabled: bool) -> bool:
    """Set the global automation master switch state in Redis and in-memory cache."""
    global _in_memory_global_automation_enabled
    _in_memory_global_automation_enabled = enabled
    try:
        from app.core.redis import get_redis_client
        client = await get_redis_client()
        await client.set(GLOBAL_AUTOMATION_REDIS_KEY, "true" if enabled else "false")
        logger.info("[Automation Engine] Successfully set global automation master toggle in Redis to: %s", enabled)
    except Exception as e:
        logger.warning("[Automation Engine] Failed to persist global automation toggle to Redis (%s), saved in-memory: %s", e, enabled)
    return _in_memory_global_automation_enabled


class AutomationService:
    RESTRICTED_ROLES = {"agent", "call_center"}

    @staticmethod
    async def get_settings(session: AsyncSession) -> AutomationSettings:
        """Return persisted singleton settings or an unsaved default record."""
        automation_settings = await session.get(AutomationSettings, 1)
        if automation_settings is None:
            automation_settings = AutomationSettings(id=1)
        return automation_settings

    @classmethod
    async def update_settings(
        cls,
        session: AsyncSession,
        *,
        location_bot_enabled: bool,
        location_prompt_1: str,
        location_prompt_2: str,
        order_completion_bot_enabled: bool,
    ) -> AutomationSettings:
        automation_settings = await cls.get_settings(session)
        session.add(automation_settings)
        automation_settings.location_bot_enabled = location_bot_enabled
        automation_settings.location_prompt_1 = location_prompt_1.strip()
        automation_settings.location_prompt_2 = location_prompt_2.strip()
        automation_settings.order_completion_bot_enabled = (
            order_completion_bot_enabled
        )
        await session.commit()
        await session.refresh(automation_settings)
        return automation_settings

    @staticmethod
    def _role_name(user: User) -> str:
        role = user.role.value if hasattr(user.role, "value") else str(user.role)
        return str(role).strip().lower()

    @classmethod
    def is_restricted_operator(cls, user: User) -> bool:
        return cls._role_name(user) in cls.RESTRICTED_ROLES

    @staticmethod
    def _clean_keywords(keywords: list[str]) -> list[str]:
        return list(
            dict.fromkeys(
                keyword.strip()
                for keyword in keywords
                if isinstance(keyword, str) and keyword.strip()
            )
        )

    @classmethod
    def validate_keyword_update(
        cls,
        user: User,
        rule: AutomationRule,
        submitted_keywords: list[str],
    ) -> None:
        """Prevent operators from removing keywords they did not create."""
        if not cls.is_restricted_operator(user) or rule.created_by == user.id:
            return

        existing_keywords = set(cls._clean_keywords(rule.keywords or []))
        updated_keywords = set(cls._clean_keywords(submitted_keywords))
        removed_keywords = existing_keywords - updated_keywords
        if removed_keywords:
            raise AutomationAuthorizationError(
                "Agents cannot delete pre-existing rule keywords."
            )

    @classmethod
    async def create_restricted_keyword_rule(
        cls,
        session: AsyncSession,
        user: User,
        name: str,
        brand_id: str,
        keywords: list[str],
    ) -> AutomationRule:
        """Create the fixed-shape keyword rule available to call-center operators."""
        if not cls.is_restricted_operator(user):
            raise AutomationAuthorizationError(
                "Simplified rule creation is only available to call-center operators."
            )

        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Rule name is required.")

        selected_store = brand_id.strip()
        if not selected_store or selected_store.casefold() in {"all", "الكل"}:
            raise AutomationAuthorizationError("A specific authorized store is required.")

        allowed_stores = {
            str(value).strip().casefold()
            for value in (user.brand_access or [])
            if str(value).strip()
        }
        if not allowed_stores:
            raise AutomationAuthorizationError("No authorized stores are assigned to this user.")

        has_all_access = bool(allowed_stores.intersection({"all", "الكل"}))
        if not has_all_access and selected_store.casefold() not in allowed_stores:
            raise AutomationAuthorizationError("Access denied for the selected store.")

        pages = list(
            (
                await session.execute(
                    select(ConnectedPage).where(
                        ConnectedPage.deleted_at.is_(None),
                        ConnectedPage.status == "ACTIVE",
                    )
                )
            ).scalars().all()
        )
        selected_normalized = selected_store.casefold()
        page = next(
            (
                candidate
                for candidate in pages
                if selected_normalized == str(candidate.page_id).strip().casefold()
                or selected_normalized == str(candidate.name).strip().casefold()
            ),
            None,
        )
        if page is None:
            raise AutomationAuthorizationError("The selected store is not connected.")

        clean_keywords = cls._clean_keywords(keywords)
        if not clean_keywords:
            raise ValueError("At least one keyword is required.")

        rule = AutomationRule(
            name=clean_name,
            brand_id=page.name,
            page_id=page.page_id,
            channels=["all"],
            trigger_type="keyword_match",
            match_type="contains",
            keywords=clean_keywords,
            response_text="",
            page_responses={},
            split_lines=True,
            delay_seconds=0,
            human_typing_simulation=False,
            cooldown_minutes=0,
            is_active=True,
            created_by=user.id,
        )
        session.add(rule)
        await session.commit()
        await session.refresh(rule)
        return rule

    @staticmethod
    async def is_global_enabled() -> bool:
        return await is_global_automation_enabled()

    @staticmethod
    async def set_global_enabled(enabled: bool) -> bool:
        return await set_global_automation_enabled(enabled)

    @staticmethod
    async def evaluate_inbound_message(
        session: AsyncSession,
        conversation: Conversation,
        customer: Customer,
        text: Optional[str],
    ) -> Optional[Message]:
        if not text or not text.strip():
            return None

        # 0. Global Master Automation Toggle Check
        # If the global master circuit breaker is off, bypass all automation immediately across the entire CRM
        if not await is_global_automation_enabled():
            logger.info("[Automation Engine] Global automation master switch is disabled. Skipping auto-reply.")
            return None

        # Resolve Page ID from conversation context
        conv_page_id = (getattr(conversation, "page_id", None) or "").strip()
        if not conv_page_id and getattr(conversation, "connected_page_id", None):
            try:
                from app.models.connected_page import ConnectedPage
                cp_lookup = await session.get(ConnectedPage, conversation.connected_page_id)
                if cp_lookup and cp_lookup.page_id:
                    conv_page_id = cp_lookup.page_id.strip()
            except Exception:
                pass

        if not conv_page_id and conversation.brand:
            try:
                from app.models.connected_page import ConnectedPage
                cp_by_brand = (await session.execute(
                    select(ConnectedPage).where(
                        ConnectedPage.name == conversation.brand,
                        ConnectedPage.status == "ACTIVE",
                        ConnectedPage.deleted_at.is_(None),
                    ).limit(1)
                )).scalars().first()
                if cp_by_brand and cp_by_brand.page_id:
                    conv_page_id = cp_by_brand.page_id.strip()
            except Exception:
                pass

        # 1. Page-Level Automation Toggle Check
        # If connected_page.is_automation_enabled is False, skip automated replies entirely
        if conv_page_id:
            from app.models.connected_page import ConnectedPage
            stmt_page = select(ConnectedPage).where(
                (ConnectedPage.page_id == conv_page_id) | (ConnectedPage.instagram_business_account_id == conv_page_id),
                ConnectedPage.deleted_at.is_(None)
            )
            page_row = (await session.execute(stmt_page)).scalars().first()
            if page_row and not page_row.is_automation_enabled:
                logger.info(
                    "[Automation Engine] Page %s ('%s') has automation disabled (is_automation_enabled=False). Skipping auto-reply.",
                    conv_page_id,
                    page_row.name,
                )
                return None

        # 2. Strict Page-Level Isolation:
        # Match keywords against active rules where rule.page_id == conv.page_id,
        # or rule applies globally (page_id is null/'all'), or page_responses contains conv_page_id.
        if not conv_page_id:
            logger.info("[Automation Engine] Conversation %s has no resolved page_id. Skipping auto-reply to enforce page isolation.", conversation.id)
            return None

        from sqlalchemy import or_
        stmt = select(AutomationRule).where(
            AutomationRule.is_active == True,
            or_(
                AutomationRule.page_id == conv_page_id,
                AutomationRule.page_id.is_(None),
                AutomationRule.page_id == "all",
                AutomationRule.page_id == "",
                AutomationRule.page_responses.has_key(conv_page_id),
            ),
        )
        res = await session.execute(stmt)
        rules = list(res.scalars().all())

        if not rules:
            logger.debug("[Automation Engine] No active rules found for page_id=%s", conv_page_id)
            return None

        conv_channel = conversation.channel.value.lower() if hasattr(conversation.channel, "value") else str(conversation.channel).lower()
        clean_text = text.strip().lower()
        norm_inbound = normalize_arabic(clean_text)

        for rule in rules:
            # Channel matching check: rule only fires if incoming channel matches
            rule_channels = [c.lower().strip() for c in (rule.channels or []) if c]
            if not rule_channels:
                rule_channels = ["messenger"]
            if "all" not in rule_channels and conv_channel not in rule_channels:
                continue

            # Page applicability check: enforce strict isolation
            r_page_id = (rule.page_id or "").strip()
            r_responses = rule.page_responses if isinstance(rule.page_responses, dict) else {}
            if r_page_id and r_page_id.lower() != "all":
                if r_page_id != conv_page_id and conv_page_id not in r_responses:
                    continue
            else:
                # Rule was created for multi-page selection: if page_responses specified, conv_page_id must be in it
                if r_responses and len(r_responses) > 0 and conv_page_id not in r_responses:
                    continue

            # Keyword trigger matching check with Arabic normalization
            matched = False
            keywords = list(dict.fromkeys([k.strip() for k in (rule.keywords or []) if isinstance(k, str) and k.strip()]))
            match_type = (rule.match_type or "contains").lower()

            for kw in keywords:
                if not kw or not kw.strip():
                    continue
                clean_kw = kw.strip().lower()
                norm_kw = normalize_arabic(clean_kw)

                if match_type == "exact":
                    if clean_kw == clean_text or (norm_kw and norm_inbound and norm_kw == norm_inbound):
                        matched = True
                        break
                elif match_type == "regex":
                    try:
                        pattern = re.compile(clean_kw, re.IGNORECASE)
                        if pattern.search(clean_text) or pattern.search(norm_inbound):
                            matched = True
                            break
                    except re.error as re_err:
                        logger.warning("[Automation Engine] Invalid regex pattern '%s' in rule %s: %s", clean_kw, rule.id, re_err)
                else:  # default 'contains'
                    if clean_kw in clean_text or (norm_kw and norm_inbound and norm_kw in norm_inbound):
                        matched = True
                        break

            if not matched:
                continue

            logger.info(
                "✅ [Automation Engine] Page-scoped keyword match found! Rule: '%s' (ID: %s, Page: %s) for Customer: %s",
                rule.name,
                rule.id,
                conv_page_id,
                customer.id,
            )

            # 3. Cooldown Period Check
            log_stmt = (
                select(AutomationExecutionLog)
                .where(
                    AutomationExecutionLog.rule_id == rule.id,
                    AutomationExecutionLog.customer_id == customer.id,
                )
                .order_by(AutomationExecutionLog.executed_at.desc())
                .limit(1)
            )
            log_res = await session.execute(log_stmt)
            latest_log = log_res.scalar_one_or_none()

            if latest_log and latest_log.executed_at:
                executed_time = latest_log.executed_at
                if executed_time.tzinfo is None:
                    executed_time = executed_time.replace(tzinfo=timezone.utc)

                now_utc = datetime.now(timezone.utc)
                diff_minutes = (now_utc - executed_time).total_seconds() / 60.0

                if diff_minutes < rule.cooldown_minutes:
                    logger.info(
                        "[Automation Engine] Cooldown active (%.1fm < %dm) for Rule '%s' on Customer %s. Skipping auto-reply.",
                        diff_minutes,
                        rule.cooldown_minutes,
                        rule.name,
                        customer.id,
                    )
                    continue

            # 4. Execute Automation & Record Execution Log
            execution_log = AutomationExecutionLog(
                rule_id=rule.id,
                conversation_id=conversation.id,
                customer_id=customer.id,
                executed_at=datetime.now(timezone.utc),
            )
            session.add(execution_log)
            await session.commit()

            # 5. Response Text Resolution (Per-page override if present, else fallback)
            page_responses = rule.page_responses if isinstance(rule.page_responses, dict) else {}
            custom_reply = (page_responses.get(conv_page_id) or "").strip()
            raw_text = custom_reply if custom_reply else (rule.response_text or "").strip()
            if not raw_text:
                return None

            # Split by line breaks (\n\n, \r\n, \n) into trimmed message segments
            if "\n" in raw_text or "\r" in raw_text:
                chunks = [seg.strip() for seg in re.split(r'[\r\n]+', raw_text) if seg.strip()]
            else:
                chunks = [raw_text]

            # 5a. Creator Name Resolution for Bot Attribution
            creator_name = None
            if rule.created_by:
                creator_user = await session.get(User, rule.created_by)
                if creator_user and creator_user.full_name:
                    creator_name = creator_user.full_name

            if not creator_name:
                admin_stmt = (
                    select(User)
                    .where(
                        User.role.in_([UserRole.ADMIN, UserRole.SUPERADMIN]),
                        User.is_active == True,
                    )
                    .order_by(User.created_at.asc())
                    .limit(1)
                )
                admin_user = (await session.execute(admin_stmt)).scalars().first()
                if admin_user and admin_user.full_name:
                    creator_name = admin_user.full_name
                else:
                    creator_name = "النظام"

            bot_sender_name = f"{creator_name} (Bot)"
            auto_metadata = {
                "is_automated": True,
                "is_bot": True,
                "automation_rule_id": str(rule.id),
                "automation_rule_name": rule.name,
                "bot_sender_name": bot_sender_name,
                "sender_name": bot_sender_name,
                "bot_creator_name": creator_name,
                "bot_creator_id": str(rule.created_by) if rule.created_by else None,
            }

            outbound_msg = None
            sim_typing = getattr(rule, "human_typing_simulation", True)
            inter_message_delay = 1.2  # Sequential delay between messages as specified

            import asyncio
            from app.services.message_service import MessageService
            from app.infrastructure.realtime.ws_broadcaster import ws_broadcaster

            for idx, chunk in enumerate(chunks):
                if not chunk:
                    continue

                if sim_typing:
                    # Calculate human-like typing delay per segment
                    typing_delay = max(0.6, min(2.5, len(chunk) * 0.03))
                    try:
                        await ws_broadcaster.broadcast_event(
                            target="conversation",
                            conversation_id=str(conversation.id),
                            payload={
                                "type": "TYPING_INDICATOR",
                                "conversation_id": str(conversation.id),
                                "is_typing": True,
                                "sender_name": bot_sender_name,
                            }
                        )
                    except Exception:
                        pass
                    await asyncio.sleep(typing_delay)

                try:
                    outbound_res = await MessageService.send_agent_reply(
                        session=session,
                        conversation_id=conversation.id,
                        text=chunk,
                        sender_external_id="automation_bot",
                        metadata_=auto_metadata,
                        sender_name=bot_sender_name,
                    )
                    logger.info(
                        "✅ [Automation Engine] Successfully dispatched message segment %d/%d for Rule '%s' (Bot: %s)",
                        idx + 1,
                        len(chunks),
                        rule.name,
                        bot_sender_name,
                    )

                    msg_obj = getattr(outbound_res, "message", None)
                    if msg_obj:
                        outbound_msg = msg_obj
                        msg_dict = msg_obj.model_dump(mode="json") if hasattr(msg_obj, "model_dump") else {
                            "id": str(getattr(msg_obj, "id", "")),
                            "conversation_id": str(conversation.id),
                            "external_message_id": getattr(msg_obj, "external_message_id", None),
                            "sender_type": "agent",
                            "sender_external_id": "automation_bot",
                            "sender_name": bot_sender_name,
                            "message_type": "text",
                            "text": getattr(msg_obj, "text", chunk),
                            "metadata": auto_metadata,
                            "metadata_": auto_metadata,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "delivery_status": "delivered",
                        }
                        if not msg_dict.get("metadata"):
                            msg_dict["metadata"] = auto_metadata
                        if not msg_dict.get("metadata_"):
                            msg_dict["metadata_"] = auto_metadata
                        if not msg_dict.get("sender_name"):
                            msg_dict["sender_name"] = bot_sender_name

                        brand_val = getattr(conversation, "brand", None)
                        if brand_val and "brand" not in msg_dict:
                            msg_dict["brand"] = brand_val

                        await ws_broadcaster.broadcast_event(
                            target="conversation",
                            conversation_id=str(conversation.id),
                            payload={
                                "type": "NEW_MESSAGE",
                                "conversation_id": str(conversation.id),
                                "brand": brand_val,
                                "message": msg_dict,
                            }
                        )
                except Exception as dispatch_err:
                    logger.error(
                        "⚠️ [Automation Engine] Message dispatch error for Rule '%s' segment %d/%d: %s",
                        rule.name,
                        idx + 1,
                        len(chunks),
                        dispatch_err,
                        exc_info=True,
                    )

                # Wait 1.2s delay between multiple sequential messages
                if idx < len(chunks) - 1:
                    await asyncio.sleep(inter_message_delay)

            return outbound_msg

        return None
