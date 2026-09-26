from datetime import datetime
import re
import uuid
from typing import Any, Dict, Optional
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.connected_page import ConnectedPage
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.message import Message
from app.models.enums import ChannelEnum, ConversationStatusEnum, ProviderEnum, SenderTypeEnum


class ConversationService:
    MAX_CONVERSATION_LABELS = 20
    MAX_CONVERSATION_LABEL_LENGTH = 80
    COMPLETED_ORDER_LABEL = "طلبات مكتملة"

    # Accept common local Arab mobile/landline numbers and international Arab
    # calling codes, while allowing the separators customers commonly type.
    _ARAB_PHONE_PATTERN = re.compile(
        r"""
        (?<!\d)
        (?:
            0[1-9](?:[\s().-]*\d){7,9}
            |
            (?:\+|00)(?:
                20|212|213|216|218|222|249|252|253|269|961|962|963|964|
                965|966|967|968|970|971|972|973|974
            )(?:[\s().-]*\d){7,10}
        )
        (?!\d)
        """,
        re.VERBOSE,
    )
    _PURCHASE_CONFIRMATION_PATTERN = re.compile(
        r"(?:"
        r"اكد|تاكيد|مؤكد|موافق|تمام|خلاص|نعم|اوكي|نبي|ابي|ابغى|اريد|ارغب|"
        r"احجز|اطلب|اشتري|نشتري|ناخذ|باخذ|"
        r"(?<![\w\u0600-\u06ff])تم(?![\w\u0600-\u06ff])|"
        r"\bconfirm(?:ed)?\b|\byes\b|\bplace\s+(?:the\s+)?order\b|"
        r"\b(?:i\s+)?want\s+to\s+(?:buy|order)\b|\bi(?:'|’)ll\s+take\b"
        r")",
        re.IGNORECASE,
    )
    _PURCHASE_REJECTION_PATTERN = re.compile(
        r"(?:"
        r"لا\s+(?:اكد|اريد|ارغب|نبي|ابي|ابغى)|"
        r"(?:ما|مش)\s+(?:نبي|ابي|ابغى|عايز|اريد)|"
        r"الغاء|الغي|\bcancel\b|\bdo\s+not\b|\bdon(?:'|’)t\b"
        r")",
        re.IGNORECASE,
    )

    _ARAB_COUNTRIES: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("ليبيا", ("ليبيا", "ليبي", "ليبية")),
        ("مصر", ("مصر", "مصري", "مصرية")),
        ("السعودية", ("السعودية", "السعوديه", "سعودي", "سعودية")),
        ("الإمارات", ("الإمارات", "الامارات", "إماراتي", "اماراتي")),
        ("الكويت", ("الكويت", "كويتي", "كويتية")),
        ("قطر", ("قطر", "قطري", "قطرية")),
        ("البحرين", ("البحرين", "بحريني", "بحرينية")),
        ("عُمان", ("سلطنة عمان", "سلطنة عُمان", "عُمان", "عماني", "عمانية")),
        ("الأردن", ("الأردن", "الاردن", "أردني", "اردني", "أردنية")),
        ("العراق", ("العراق", "عراقي", "عراقية")),
        ("لبنان", ("لبنان", "لبناني", "لبنانية")),
        ("سوريا", ("سوريا", "سوري", "سورية")),
        ("فلسطين", ("فلسطين", "فلسطيني", "فلسطينية")),
        ("اليمن", ("اليمن", "يمني", "يمنية")),
        ("السودان", ("السودان", "سوداني", "سودانية")),
        ("تونس", ("تونس", "تونسي", "تونسية")),
        ("الجزائر", ("الجزائر", "جزائري", "جزائرية")),
        ("المغرب", ("المغرب", "مغربي", "مغربية")),
    )
    _ARAB_CITIES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
        ("طرابلس", "ليبيا", ("طرابلس",)),
        ("بنغازي", "ليبيا", ("بنغازي", "بن غازي")),
        ("مصراتة", "ليبيا", ("مصراتة", "مصراته")),
        ("الزاوية", "ليبيا", ("الزاوية", "الزاويه")),
        ("سبها", "ليبيا", ("سبها",)),
        ("البيضاء", "ليبيا", ("البيضاء", "البيضا")),
        ("درنة", "ليبيا", ("درنة", "درنه")),
        ("سرت", "ليبيا", ("سرت",)),
        ("طبرق", "ليبيا", ("طبرق",)),
        ("زليتن", "ليبيا", ("زليتن",)),
        ("الخمس", "ليبيا", ("الخمس",)),
        ("القاهرة", "مصر", ("القاهرة", "القاهره")),
        ("الإسكندرية", "مصر", ("الإسكندرية", "الاسكندرية", "اسكندرية", "اسكندريه")),
        ("الرياض", "السعودية", ("الرياض",)),
        ("جدة", "السعودية", ("جدة", "جده")),
        ("مكة", "السعودية", ("مكة", "مكه")),
        ("دبي", "الإمارات", ("دبي",)),
        ("أبوظبي", "الإمارات", ("أبوظبي", "ابوظبي", "أبو ظبي", "ابو ظبي")),
        ("بغداد", "العراق", ("بغداد",)),
        ("البصرة", "العراق", ("البصرة", "البصره")),
        ("عمّان", "الأردن", ("عمّان",)),
        ("بيروت", "لبنان", ("بيروت",)),
        ("دمشق", "سوريا", ("دمشق",)),
    )
    _FLAG_PATTERN = re.compile(r"[\U0001F1E6-\U0001F1FF]{2}")
    _FLAG_COUNTRIES: dict[str, str] = {
        "AE": "الإمارات",
        "BH": "البحرين",
        "DZ": "الجزائر",
        "EG": "مصر",
        "IQ": "العراق",
        "JO": "الأردن",
        "KW": "الكويت",
        "LB": "لبنان",
        "LY": "ليبيا",
        "MA": "المغرب",
        "OM": "عُمان",
        "PS": "فلسطين",
        "QA": "قطر",
        "SA": "السعودية",
        "SD": "السودان",
        "SO": "الصومال",
        "SY": "سوريا",
        "TN": "تونس",
        "TR": "تركيا",
        "YE": "اليمن",
        # Common non-Arab markets. Other valid flags use their ISO alpha-2 code
        # rather than being discarded and causing the location prompt to fire.
        "CA": "كندا",
        "CN": "الصين",
        "DE": "ألمانيا",
        "ES": "إسبانيا",
        "FR": "فرنسا",
        "GB": "المملكة المتحدة",
        "IN": "الهند",
        "IT": "إيطاليا",
        "JP": "اليابان",
        "RU": "روسيا",
        "US": "الولايات المتحدة",
    }
    _COUNTRY_CONTEXT_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("ليبيا", ("دينار ليبي", "د.ل", "libyan dinar", "libya")),
        ("مصر", ("جنيه مصري", "ج.م", "egyptian pound", "egypt")),
        ("السعودية", ("ريال سعودي", "ر.س", "saudi riyal", "saudi arabia")),
        ("الإمارات", ("درهم إماراتي", "درهم اماراتي", "د.إ", "uae dirham", "united arab emirates")),
        ("تونس", ("دينار تونسي", "tunisian dinar", "tunisia")),
        ("الجزائر", ("دينار جزائري", "algerian dinar", "algeria")),
        ("الكويت", ("دينار كويتي", "kuwaiti dinar", "kuwait")),
        ("قطر", ("ريال قطري", "qatari riyal", "qatar")),
        ("البحرين", ("دينار بحريني", "bahraini dinar", "bahrain")),
        ("عُمان", ("ريال عماني", "omani rial", "oman")),
        ("الأردن", ("دينار أردني", "دينار اردني", "jordanian dinar", "jordan")),
        ("العراق", ("دينار عراقي", "iraqi dinar", "iraq")),
        ("لبنان", ("ليرة لبنانية", "lebanese pound", "lebanon")),
        ("سوريا", ("ليرة سورية", "syrian pound", "syria")),
        ("المغرب", ("درهم مغربي", "moroccan dirham", "morocco")),
        ("اليمن", ("ريال يمني", "yemeni rial", "yemen")),
        ("السودان", ("جنيه سوداني", "sudanese pound", "sudan")),
    )

    @staticmethod
    def _normalize_location_text(text: str) -> str:
        return " ".join(
            text.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ى": "ي", "ة": "ه", "ـ": ""})).split()
        ).casefold()

    @classmethod
    def is_completed_order_message(cls, text: Optional[str]) -> bool:
        """Return whether a message confirms a purchase and includes a phone."""
        if not text or not text.strip():
            return False

        normalized = cls._normalize_location_text(text)
        return bool(
            cls._ARAB_PHONE_PATTERN.search(text)
            and cls._PURCHASE_CONFIRMATION_PATTERN.search(normalized)
            and not cls._PURCHASE_REJECTION_PATTERN.search(normalized)
        )

    @classmethod
    async def apply_completed_order_label(
        cls,
        session: AsyncSession,
        conversation: Conversation,
        text: Optional[str],
    ) -> bool:
        """Add the completed-order label once when an inbound message qualifies."""
        if not cls.is_completed_order_message(text):
            return False

        labels = list(conversation.labels or [])
        if any(label.casefold() == cls.COMPLETED_ORDER_LABEL.casefold() for label in labels):
            return False

        await cls.update_labels(
            session=session,
            conversation=conversation,
            labels=[*labels, cls.COMPLETED_ORDER_LABEL],
        )
        return True

    @classmethod
    def extract_arab_location(
        cls, text: Optional[str]
    ) -> tuple[Optional[str], Optional[str]]:
        """Return canonical (country, city) entities found in an inbound message."""
        if not text or not text.strip():
            return None, None

        flag_match = cls._FLAG_PATTERN.search(text)
        if flag_match:
            flag = flag_match.group(0)
            country_code = "".join(chr(ord(char) - 0x1F1E6 + ord("A")) for char in flag)
            return cls._FLAG_COUNTRIES.get(country_code, country_code), None

        normalized = cls._normalize_location_text(text)
        for city, country, aliases in cls._ARAB_CITIES:
            if any(cls._normalize_location_text(alias) in normalized for alias in aliases):
                return country, city

        for country, aliases in cls._ARAB_COUNTRIES:
            if any(cls._normalize_location_text(alias) in normalized for alias in aliases):
                return country, None

        return None, None

    @classmethod
    def infer_country_from_context(cls, *context_values: Optional[str]) -> Optional[str]:
        """Infer a country from page/store names or explicit currency hints."""
        context = " ".join(str(value).strip() for value in context_values if value)
        if not context:
            return None

        country, _ = cls.extract_arab_location(context)
        if country:
            return country

        normalized = cls._normalize_location_text(context)
        for country, hints in cls._COUNTRY_CONTEXT_HINTS:
            if any(cls._normalize_location_text(hint) in normalized for hint in hints):
                return country
        return None

    @staticmethod
    async def update_unread_count(
        session: AsyncSession,
        conversation: Conversation,
        unread_count: int,
    ) -> Conversation:
        """Persist an explicit read/unread state for an existing conversation."""
        conversation.unread_count = max(0, unread_count)
        # This timestamp also distinguishes an explicit agent toggle from stale
        # unread counters left behind by an older outbound-message workflow.
        conversation.last_read_at = func.now()
        await session.commit()
        await session.refresh(conversation)
        return conversation

    @classmethod
    async def update_labels(
        cls,
        session: AsyncSession,
        conversation: Conversation,
        labels: list[str],
    ) -> Conversation:
        """Replace conversation labels after trimming and stable de-duplication."""
        normalized_labels: list[str] = []
        seen: set[str] = set()
        for raw_label in labels:
            label = str(raw_label).strip()
            key = label.casefold()
            if not label or key in seen:
                continue
            if len(label) > cls.MAX_CONVERSATION_LABEL_LENGTH:
                raise ValueError(
                    f"Conversation labels must not exceed {cls.MAX_CONVERSATION_LABEL_LENGTH} characters."
                )
            seen.add(key)
            normalized_labels.append(label)
        if len(normalized_labels) > cls.MAX_CONVERSATION_LABELS:
            raise ValueError(
                f"A conversation can have at most {cls.MAX_CONVERSATION_LABELS} labels."
            )

        conversation.labels = normalized_labels
        await session.commit()
        await session.refresh(conversation)
        return conversation

    @staticmethod
    async def sync_unread_state_with_latest_message(
        session: AsyncSession,
        conversation: Conversation,
        increment_customer: bool = False,
    ) -> Optional[SenderTypeEnum]:
        """Reconcile unread state using the latest persisted, non-deleted message."""
        locked_conversation_id = (
            await session.execute(
                select(Conversation.id)
                .where(Conversation.id == conversation.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if not locked_conversation_id:
            return None

        await session.refresh(conversation, attribute_names=["unread_count"])
        latest_sender_type = (
            await session.execute(
                select(Message.sender_type)
                .where(
                    Message.conversation_id == conversation.id,
                    Message.deleted_at.is_(None),
                )
                .order_by(Message.created_at.desc(), Message.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if latest_sender_type == SenderTypeEnum.CUSTOMER:
            if increment_customer:
                conversation.unread_count = (getattr(conversation, "unread_count", 0) or 0) + 1
            conversation.is_unread = (getattr(conversation, "unread_count", 0) or 0) > 0
        else:
            conversation.unread_count = 0
            conversation.is_unread = False

        return latest_sender_type

    @staticmethod
    async def create_conversation(
        session: AsyncSession,
        customer_id: uuid.UUID,
        provider: ProviderEnum,
        channel: ChannelEnum,
        external_conversation_id: str,
        subject: Optional[str] = None,
        status: ConversationStatusEnum = ConversationStatusEnum.OPEN,
        brand: Optional[str] = None,
        workspace_id: Optional[uuid.UUID] = None,
        last_message_at: Optional[datetime] = None,
    ) -> Conversation:
        conversation = Conversation(
            customer_id=customer_id,
            provider=provider,
            channel=channel,
            external_conversation_id=external_conversation_id,
            subject=subject,
            status=status,
            brand=brand or "Default Business Page",
            workspace_id=workspace_id,
            last_message_at=last_message_at or func.now(),
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
        brand: Optional[str] = None,
        workspace_id: Optional[uuid.UUID] = None,
        last_message_at: Optional[datetime] = None,
    ) -> Conversation:
        # First check if customer ALREADY has an existing conversation thread
        stmt_cust = (
            select(Conversation)
            .where(
                Conversation.customer_id == identity.customer_id,
                Conversation.deleted_at.is_(None),
            )
            .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
            .limit(1)
        )
        res_cust = await session.execute(stmt_cust)
        existing_cust_conv = res_cust.scalar_one_or_none()
        if existing_cust_conv:
            modified = False
            if brand and (not existing_cust_conv.brand or existing_cust_conv.brand in ("LAVVA", "Default Business Page") or str(existing_cust_conv.brand).startswith("Page ")):
                existing_cust_conv.brand = brand
                modified = True
            if workspace_id and not existing_cust_conv.workspace_id:
                existing_cust_conv.workspace_id = workspace_id
                modified = True
            if modified:
                await session.flush()
            return existing_cust_conv

        ext_conv_id = f"resp_conv_{identity.external_user_id}"
        existing = await ConversationService.get_conversation_by_external_id(
            session=session,
            provider=identity.provider,
            channel=identity.channel,
            external_conversation_id=ext_conv_id,
        )
        if existing:
            modified = False
            if brand and (not existing.brand or existing.brand in ("LAVVA", "Default Business Page") or str(existing.brand).startswith("Page ")):
                existing.brand = brand
                modified = True
            if workspace_id and not existing.workspace_id:
                existing.workspace_id = workspace_id
                modified = True
            if modified:
                await session.flush()
            return existing

        return await ConversationService.create_conversation(
            session=session,
            customer_id=identity.customer_id,
            provider=identity.provider,
            channel=identity.channel,
            external_conversation_id=ext_conv_id,
            subject=subject or f"Conversation ({identity.external_user_id})",
            brand=brand,
            workspace_id=workspace_id,
            last_message_at=last_message_at,
        )

    @staticmethod
    async def list_conversations(
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        customer_id: Optional[uuid.UUID] = None,
        provider: Optional[ProviderEnum | str] = None,
        channel: Optional[ChannelEnum] = None,
        channels: Optional[list[ChannelEnum]] = None,
        status: Optional[ConversationStatusEnum] = None,
        include_archived: bool = False,
        search: Optional[str] = None,
        brand: Optional[str] = None,
        brands: Optional[list[str]] = None,
        location: Optional[str] = None,
        country: Optional[str] = None,
        countries: Optional[list[str]] = None,
        sla_status: Optional[str] = None,
        assigned_agent_id: Optional[str] = None,
        allowed_brands: Optional[list[str]] = None,
        allowed_channels: Optional[list[str]] = None,
        conversation_filter: Optional[str] = None,
        include_unread_total: bool = False,
    ) -> tuple[list[dict], int] | tuple[list[dict], int, int]:
        stmt = (
            select(Conversation)
            .options(selectinload(Conversation.customer))
            .where(Conversation.deleted_at.is_(None))
        )
        count_stmt = select(func.count(func.distinct(Conversation.id))).where(
            Conversation.deleted_at.is_(None)
        )

        # Enforce user authorization scoping for brands
        if allowed_brands is not None:
            clean_allowed_b = [str(b).strip().lower() for b in allowed_brands if str(b).strip()]
            allowed_brand_filter = func.trim(func.lower(Conversation.brand)).in_(clean_allowed_b)
            stmt = stmt.where(allowed_brand_filter)
            count_stmt = count_stmt.where(allowed_brand_filter)

        # Enforce user authorization scoping for channels
        if allowed_channels is not None:
            clean_allowed_c = [c.strip().lower() for c in allowed_channels if c.strip()]
            enum_channels = [ChannelEnum(c) for c in clean_allowed_c if c in ChannelEnum._value2member_map_]
            stmt = stmt.where(Conversation.channel.in_(enum_channels))
            count_stmt = count_stmt.where(Conversation.channel.in_(enum_channels))

        raw_countries = countries if countries is not None else ([country if country is not None else location] if (country is not None or location is not None) else [])
        target_countries = [str(value).strip() for value in raw_countries if value and str(value).strip().lower() not in ["all", "الكل"]]
        if target_countries:
            stmt = stmt.join(Conversation.customer)
            count_stmt = count_stmt.join(Conversation.customer)
            country_filter = or_(*[func.lower(Customer.country) == value.lower() for value in target_countries])
            stmt = stmt.where(country_filter)
            count_stmt = count_stmt.where(country_filter)

        raw_brands = brands if brands is not None else ([brand] if brand is not None else [])
        target_stores = [str(value).strip() for value in raw_brands if value and str(value).strip().lower() not in ["all", "الكل", "none"]]
        if target_stores:
            normalized_store_names = [value.lower() for value in target_stores]
            brand_filter = or_(
                func.trim(func.lower(Conversation.brand)).in_(normalized_store_names),
                Conversation.page_id.in_(target_stores),
            )
            stmt = stmt.where(brand_filter)
            count_stmt = count_stmt.where(brand_filter)

        if sla_status and sla_status.strip():
            stmt = stmt.where(Conversation.sla_status == sla_status.strip())
            count_stmt = count_stmt.where(Conversation.sla_status == sla_status.strip())

        if assigned_agent_id and assigned_agent_id.strip() and assigned_agent_id.lower() not in ["all", "الكل", "none", ""]:
            clean_agent = assigned_agent_id.strip()
            agent_filter = (
                (Conversation.assigned_agent_id == clean_agent) |
                Conversation.assigned_agent_id.ilike(f"%{clean_agent}%")
            )
            stmt = stmt.where(agent_filter)
            count_stmt = count_stmt.where(agent_filter)

        if customer_id:
            stmt = stmt.where(Conversation.customer_id == customer_id)
            count_stmt = count_stmt.where(Conversation.customer_id == customer_id)

        unread_only = (conversation_filter or "").strip().lower() == "unread"
        if unread_only:
            stmt = stmt.where(Conversation.unread_count > 0)
            count_stmt = count_stmt.where(Conversation.unread_count > 0)

        # Keep the unread badge count independent from the normal inbox's
        # customer-level deduplication: it represents distinct conversations.
        unread_count_stmt = count_stmt
        if not unread_only:
            unread_count_stmt = unread_count_stmt.where(Conversation.unread_count > 0)

        # Provider filtering & Deduplication
        if provider is not None and str(provider).strip().lower() not in ["all", "none", "", "الكل"]:
            p_val = provider.value if hasattr(provider, "value") else str(provider).strip().lower()
            if p_val in ["beon", "مزود beon", "beon gateway"]:
                stmt = stmt.where(Conversation.provider == ProviderEnum.BEON)
                count_stmt = count_stmt.where(Conversation.provider == ProviderEnum.BEON)
                unread_count_stmt = unread_count_stmt.where(Conversation.provider == ProviderEnum.BEON)
            elif p_val in ["meta", "direct_meta", "ميتا مباشر", "direct meta"]:
                stmt = stmt.where(Conversation.provider == ProviderEnum.META)
                count_stmt = count_stmt.where(Conversation.provider == ProviderEnum.META)
                unread_count_stmt = unread_count_stmt.where(Conversation.provider == ProviderEnum.META)
            else:
                try:
                    p_enum = ProviderEnum(p_val)
                    stmt = stmt.where(Conversation.provider == p_enum)
                    count_stmt = count_stmt.where(Conversation.provider == p_enum)
                    unread_count_stmt = unread_count_stmt.where(Conversation.provider == p_enum)
                except ValueError:
                    pass
        elif not unread_only:
            # "ALL" Mode: Deduplicate conversations per customer using Window Function
            subq = (
                select(
                    Conversation.id.label("conv_id"),
                    func.row_number().over(
                        partition_by=Conversation.customer_id,
                        order_by=(
                            Conversation.last_message_at.desc().nullslast(),
                            Conversation.created_at.desc(),
                            Conversation.id.desc(),
                        )
                    ).label("rn")
                ).subquery()
            )
            stmt = stmt.join(subq, Conversation.id == subq.c.conv_id).where(subq.c.rn == 1)
            count_stmt = count_stmt.join(subq, Conversation.id == subq.c.conv_id).where(subq.c.rn == 1)

        target_channels = channels if channels is not None else ([channel] if channel is not None else [])
        if target_channels:
            stmt = stmt.where(Conversation.channel.in_(target_channels))
            count_stmt = count_stmt.where(Conversation.channel.in_(target_channels))
            unread_count_stmt = unread_count_stmt.where(Conversation.channel.in_(target_channels))

        # Archive / Status Filter
        if status is not None:
            stmt = stmt.where(Conversation.status == status)
            count_stmt = count_stmt.where(Conversation.status == status)
            unread_count_stmt = unread_count_stmt.where(Conversation.status == status)
        elif not include_archived:
            stmt = stmt.where(Conversation.status != ConversationStatusEnum.CLOSED)
            count_stmt = count_stmt.where(Conversation.status != ConversationStatusEnum.CLOSED)
            unread_count_stmt = unread_count_stmt.where(
                Conversation.status != ConversationStatusEnum.CLOSED
            )
        else:
            stmt = stmt.where(Conversation.status == ConversationStatusEnum.CLOSED)
            count_stmt = count_stmt.where(Conversation.status == ConversationStatusEnum.CLOSED)
            unread_count_stmt = unread_count_stmt.where(
                Conversation.status == ConversationStatusEnum.CLOSED
            )

        if search and search.strip():
            term = f"%{search.strip()}%"
            if not target_countries:
                stmt = stmt.outerjoin(Conversation.customer)
                count_stmt = count_stmt.outerjoin(Conversation.customer)
                unread_count_stmt = unread_count_stmt.outerjoin(Conversation.customer)
            matching_customer_identity = (
                select(CustomerIdentity.id)
                .where(
                    CustomerIdentity.customer_id == Conversation.customer_id,
                    CustomerIdentity.external_user_id.ilike(term),
                )
                .exists()
            )
            matching_message = (
                select(Message.id)
                .where(
                    Message.conversation_id == Conversation.id,
                    Message.deleted_at.is_(None),
                    Message.text.ilike(term),
                )
                .exists()
            )
            search_filter = (
                Conversation.subject.ilike(term) |
                Conversation.brand.ilike(term) |
                Conversation.external_conversation_id.ilike(term) |
                Customer.display_name.ilike(term) |
                Customer.phone.ilike(term) |
                matching_customer_identity |
                matching_message
            )
            stmt = stmt.where(search_filter)
            count_stmt = count_stmt.where(search_filter)
            unread_count_stmt = unread_count_stmt.where(search_filter)

        total_unread_conversations = 0
        if include_unread_total:
            unread_total_res = await session.execute(unread_count_stmt)
            total_unread_conversations = int(unread_total_res.scalar() or 0)

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

        # Batch load the latest message for each conversation in a single round-trip (PERF-01)
        latest_msg_map: dict[uuid.UUID, Message] = {}
        conv_ids = [conv.id for conv in conversations]
        if conv_ids:
            rn_col = (
                func.row_number()
                .over(
                    partition_by=Message.conversation_id,
                    order_by=(Message.created_at.desc(), Message.id.desc()),
                )
                .label("rn")
            )
            subq = (
                select(Message.id.label("mid"), rn_col)
                .where(
                    Message.conversation_id.in_(conv_ids),
                    Message.deleted_at.is_(None),
                )
                .subquery()
            )
            msg_stmt = (
                select(Message)
                .join(subq, Message.id == subq.c.mid)
                .where(subq.c.rn == 1)
            )
            msg_res = await session.execute(msg_stmt)
            for m in msg_res.scalars().all():
                latest_msg_map[m.conversation_id] = m

        # Resolve connected Page avatars in one query so list serialization
        # always carries a stable store/brand logo URL.
        connected_page_map: dict[uuid.UUID, ConnectedPage] = {}
        page_id_map: dict[str, ConnectedPage] = {}
        connected_page_ids = {
            conv.connected_page_id for conv in conversations if conv.connected_page_id
        }
        conversation_page_ids = {
            str(
                getattr(conv, "external_page_id", None)
                or getattr(conv, "page_id", None)
            ).strip()
            for conv in conversations
            if getattr(conv, "external_page_id", None)
            or getattr(conv, "page_id", None)
        }
        conversation_brands = {
            str(conv.brand).strip().lower()
            for conv in conversations
            if getattr(conv, "brand", None)
        }
        page_conditions = []
        if connected_page_ids:
            page_conditions.append(ConnectedPage.id.in_(connected_page_ids))
        if conversation_page_ids:
            page_conditions.append(
                or_(
                    ConnectedPage.page_id.in_(conversation_page_ids),
                    ConnectedPage.instagram_business_account_id.in_(conversation_page_ids),
                )
            )
        if conversation_brands:
            page_conditions.append(func.lower(ConnectedPage.name).in_(conversation_brands))
        if page_conditions:
            page_rows = (
                await session.execute(
                    select(ConnectedPage).where(
                        or_(*page_conditions),
                        ConnectedPage.deleted_at.is_(None),
                    )
                )
            ).scalars().all()
            connected_page_map = {page.id: page for page in page_rows}
            for page in page_rows:
                if page.page_id:
                    page_id_map[str(page.page_id).strip()] = page
                if page.instagram_business_account_id:
                    page_id_map[str(page.instagram_business_account_id).strip()] = page
            brand_map = {
                str(page.name).strip().lower(): page
                for page in page_rows
                if page.name
            }
        else:
            brand_map = {}

        items = []
        for conv in conversations:
            cust = conv.customer
            cust_name = cust.display_name if cust and cust.display_name else None
            if not cust_name:
                chan_str = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
                if chan_str.upper() == "INSTAGRAM":
                    cust_name = "عميل Instagram"
                elif chan_str.upper() == "WHATSAPP":
                    cust_name = "عميل WhatsApp"
                else:
                    cust_name = "عميل Messenger"
            cust_avatar = cust.avatar_url if cust and cust.avatar_url else None
            connected_page = connected_page_map.get(conv.connected_page_id)
            page_reference = (
                getattr(conv, "external_page_id", None)
                or getattr(conv, "page_id", None)
            )
            if not connected_page and page_reference:
                connected_page = page_id_map.get(str(page_reference).strip())
            if not connected_page and getattr(conv, "brand", None):
                connected_page = brand_map.get(str(conv.brand).strip().lower())
            page_avatar_url = connected_page.avatar_url if connected_page else None
            unread_cnt = getattr(conv, 'unread_count', 0) or 0
            agent_id = getattr(conv, 'assigned_agent_id', None)
            prio = getattr(conv, 'priority', "normal") or "normal"
            latest_msg = latest_msg_map.get(conv.id)
            last_sender_type = None
            if latest_msg:
                last_sender_type = str(latest_msg.sender_type.value if hasattr(latest_msg.sender_type, "value") else latest_msg.sender_type)
                preview = latest_msg.text
                if not preview or preview == "مرفق وسائط":
                    m_type = str(latest_msg.message_type.value if hasattr(latest_msg.message_type, "value") else latest_msg.message_type).lower()
                    if m_type in ["audio", "voice"]:
                        preview = "تسجيل صوتي"
                    elif m_type == "image":
                        preview = "صورة مرفقة"
                    elif m_type == "location" or (preview and "📍" in preview):
                        preview = "موقع جغرافي"
                    else:
                        preview = "مرفق وسائط"
                last_text = preview
            else:
                last_text = getattr(conv, 'last_message_text', None) or "محادثة نشطة"

            was_explicitly_toggled = bool(
                conv.last_read_at
                and conv.last_message_at
                and conv.last_read_at >= conv.last_message_at
            )
            if (
                not unread_only
                and last_sender_type != SenderTypeEnum.CUSTOMER.value
                and not was_explicitly_toggled
            ):
                unread_cnt = 0

            cust_msg_at = conv.last_customer_message_at
            if not cust_msg_at and latest_msg and last_sender_type == "customer":
                cust_msg_at = latest_msg.created_at

            item = {
                "id": conv.id,
                "external_conversation_id": conv.external_conversation_id,
                "provider": conv.provider,
                "channel": conv.channel,
                "subject": conv.subject,
                "brand": getattr(conv, 'brand', "LAVVA") or "LAVVA",
                "status": conv.status,
                "priority": prio,
                "assigned_agent_id": agent_id,
                "unread_count": unread_cnt,
                "is_unread": unread_cnt > 0,
                "labels": getattr(conv, "labels", []) or [],
                "customer_id": conv.customer_id,
                "customer_display_name": cust_name,
                "customer_avatar_url": cust_avatar,
                "page_avatar_url": page_avatar_url,
                "last_message_text": last_text,
                "last_message_at": conv.last_message_at or (latest_msg.created_at if latest_msg else conv.created_at),
                "last_customer_message_at": cust_msg_at,
                "last_sender_type": last_sender_type,
                "last_activity_at": conv.last_activity_at or conv.last_message_at or conv.created_at,
                "created_at": conv.created_at,
                "updated_at": conv.updated_at,
                "sla_due_at": getattr(conv, "sla_due_at", None),
                "sla_status": getattr(conv, "sla_status", "none") or "none",
                "first_response_time_seconds": getattr(conv, "first_response_time_seconds", None),
                "customer": {
                    "id": cust.id,
                    "display_name": cust.display_name,
                    "email": cust.email,
                    "phone": cust.phone,
                    "avatar_url": cust.avatar_url,
                    "location": cust.location,
                    "country": cust.country,
                    "city": cust.city,
                    "tier": getattr(cust, "tier", "درجة أولى"),
                    "skin_type": getattr(cust, "skin_type", "عادية"),
                    "stage": getattr(cust, "stage", "جديد"),
                    "tags": getattr(cust, "tags", []) or [],
                    "created_at": cust.created_at,
                    "updated_at": cust.updated_at,
                } if cust else None,
            }
            items.append(item)

        if include_unread_total:
            return items, total, total_unread_conversations
        return items, total

    @staticmethod
    async def get_conversation_by_id(
        session: AsyncSession, conversation_id: uuid.UUID
    ) -> Optional[Conversation]:
        stmt = (
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.deleted_at.is_(None),
            )
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
            .where(
                Conversation.id == conversation_id,
                Conversation.deleted_at.is_(None),
            )
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
        latest_message = (
            await session.execute(
                select(Message)
                .where(
                    Message.conversation_id == conv.id,
                    Message.deleted_at.is_(None),
                )
                .order_by(Message.created_at.desc(), Message.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        last_sender_type = None
        if latest_message:
            last_sender_type = (
                latest_message.sender_type.value
                if hasattr(latest_message.sender_type, "value")
                else str(latest_message.sender_type)
            )
        was_explicitly_toggled = bool(
            conv.last_read_at
            and conv.last_message_at
            and conv.last_read_at >= conv.last_message_at
        )
        unread_count = (
            conv.unread_count or 0
            if last_sender_type == SenderTypeEnum.CUSTOMER.value or was_explicitly_toggled
            else 0
        )
        connected_page = None
        if conv.connected_page_id:
            connected_page = await session.get(ConnectedPage, conv.connected_page_id)
            if connected_page and connected_page.deleted_at is not None:
                connected_page = None
        page_reference = (
            getattr(conv, "external_page_id", None)
            or getattr(conv, "page_id", None)
        )
        if not connected_page and page_reference:
            connected_page = (
                await session.execute(
                    select(ConnectedPage).where(
                        or_(
                            ConnectedPage.page_id == str(page_reference).strip(),
                            ConnectedPage.instagram_business_account_id
                            == str(page_reference).strip(),
                        ),
                        ConnectedPage.deleted_at.is_(None),
                    )
                )
            ).scalars().first()
        if not connected_page and getattr(conv, "brand", None):
            connected_page = (
                await session.execute(
                    select(ConnectedPage).where(
                        func.lower(ConnectedPage.name)
                        == str(conv.brand).strip().lower(),
                        ConnectedPage.deleted_at.is_(None),
                    )
                )
            ).scalars().first()

        return {
            "id": conv.id,
            "customer_id": conv.customer_id,
            "customer_display_name": customer_obj.display_name if customer_obj else None,
            "page_avatar_url": connected_page.avatar_url if connected_page else None,
            "provider": conv.provider,
            "channel": conv.channel,
            "external_conversation_id": conv.external_conversation_id,
            "subject": conv.subject,
            "status": conv.status,
            "unread_count": unread_count,
            "is_unread": unread_count > 0,
            "labels": getattr(conv, "labels", []) or [],
            "last_sender_type": last_sender_type,
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
                Conversation.deleted_at.is_(None),
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
            .where(
                Conversation.customer_id == customer_id,
                Conversation.deleted_at.is_(None),
            )
            .order_by(Conversation.last_message_at.desc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update_conversation_status(
        session: AsyncSession,
        conversation_id: uuid.UUID,
        new_status: str | ConversationStatusEnum,
    ) -> Optional[Conversation]:
        conv = await session.get(Conversation, conversation_id)
        if not conv:
            return None
        if isinstance(new_status, str):
            try:
                enum_status = ConversationStatusEnum(new_status.lower())
            except ValueError:
                enum_status = ConversationStatusEnum.CLOSED
        else:
            enum_status = new_status
        conv.status = enum_status
        await session.commit()
        await session.refresh(conv)
        return conv

    @staticmethod
    def _user_can_access_brand_and_channel(user: Optional[Any], brand: Optional[str], channel: Any) -> bool:
        """Check if user has access to a conversation brand and channel without web layer dependencies."""
        if not user or not getattr(user, "is_active", True):
            return True
        role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
        if role_val.lower() in ("admin", "superadmin", "owner"):
            return True
        b_access = getattr(user, "brand_access", None) or []
        brand_str = str(brand or "LAVVA").strip()
        if "ALL" not in b_access and "all" not in b_access and "الكل" not in b_access:
            if brand_str not in b_access and not any(brand_str.lower() == str(b).strip().lower() for b in b_access):
                return False
        c_access = getattr(user, "channel_access", None)
        if c_access is not None:
            norm_c = [str(x).strip().lower() for x in c_access]
            if "all" not in norm_c and "الكل" not in norm_c:
                ch_str = (channel.value if hasattr(channel, "value") else str(channel)).strip().lower()
                if ch_str not in norm_c:
                    return False
        return True

    @staticmethod
    async def get_unread_summary(
        session: AsyncSession,
        user: Optional[Any] = None,
        brand: Optional[str] = None,
    ) -> dict[str, Any]:
        """Count unread conversations by total, channel, and brand."""
        latest_sender_type = (
            select(Message.sender_type)
            .where(
                Message.conversation_id == Conversation.id,
                Message.deleted_at.is_(None),
            )
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(1)
            .correlate(Conversation)
            .scalar_subquery()
        )
        stmt = (
            select(
                Conversation.brand,
                Conversation.channel,
                func.count(Conversation.id),
            )
            .where(
                Conversation.unread_count > 0,
                Conversation.deleted_at.is_(None),
                or_(
                    latest_sender_type == SenderTypeEnum.CUSTOMER,
                    Conversation.last_read_at >= Conversation.last_message_at,
                ),
            )
        )
        if brand:
            stmt = stmt.where(Conversation.brand == brand)
        stmt = stmt.group_by(Conversation.brand, Conversation.channel)
        res = await session.execute(stmt)
        rows = res.all()

        total_unread = 0
        channels_map = {"all": 0, "messenger": 0, "instagram": 0, "whatsapp": 0, "tiktok": 0}
        brands_map = {}

        for conv_brand, conv_channel, cnt in rows:
            conv_brand_str = str(conv_brand or "LAVVA")
            count_val = int(cnt or 0)
            if not ConversationService._user_can_access_brand_and_channel(user, conv_brand_str, conv_channel):
                continue

            total_unread += count_val
            ch = (conv_channel.value if hasattr(conv_channel, "value") else str(conv_channel)).lower()
            if ch in channels_map:
                channels_map[ch] += count_val

            brands_map[conv_brand_str] = brands_map.get(conv_brand_str, 0) + count_val

            # Standard aliases for UI binding
            norm_b = conv_brand_str.strip().lower()
            if "lotus" in norm_b:
                brands_map["LOTUS BLUE"] = brands_map.get("LOTUS BLUE", 0) + count_val
            elif "hayat" in norm_b:
                brands_map["HAYAT"] = brands_map.get("HAYAT", 0) + count_val
            elif "liora" in norm_b or "luxira" in norm_b:
                brands_map["LUXIRA"] = brands_map.get("LUXIRA", 0) + count_val
                brands_map["LIORA"] = brands_map.get("LIORA", 0) + count_val
            elif "loxx" in norm_b:
                brands_map["LOXX KING"] = brands_map.get("LOXX KING", 0) + count_val
            elif "lavva" in norm_b or "lava" in norm_b:
                brands_map["LAVVA"] = brands_map.get("LAVVA", 0) + count_val

        # Ensure all active connected Facebook Pages are present in brands_map
        try:
            active_pages_stmt = select(ConnectedPage.name).where(
                ConnectedPage.status == "ACTIVE",
                ConnectedPage.deleted_at.is_(None),
            )
            active_page_names = (await session.execute(active_pages_stmt)).scalars().all()
            for p_name in active_page_names:
                clean_name = str(p_name or "").strip()
                if clean_name and not clean_name.startswith("Page "):
                    if clean_name not in brands_map:
                        brands_map[clean_name] = 0
        except Exception:
            pass

        channels_map["all"] = total_unread

        return {
            "total_unread": total_unread,
            "channels": channels_map,
            "brands": brands_map,
        }
