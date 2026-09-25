#!/usr/bin/env python3
"""Consolidate common negotiation rules across every active connected page.

The migration is intentionally idempotent: after the first successful run,
each topic has one rule whose keywords and per-page responses already contain
the consolidated values. All writes and deletes happen in one transaction.
"""

import asyncio
import logging
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, select

from app.core.database import AsyncSessionLocal
from app.models.automation import AutomationRule
from app.models.connected_page import ConnectedPage


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("NegotiationRuleConsolidator")


@dataclass(frozen=True)
class Topic:
    """A canonical topic name and the phrases that identify its rules."""

    name: str
    match_phrases: tuple[str, ...]


TOPICS: tuple[Topic, ...] = (
    Topic(
        "كيف طريقة الدفع",
        (
            "كيف طريقة الدفع",
            "كيف الدفع",
            "الدفع كيف",
            "الدفع عند الاستلام",
            "دفع عند الاستلام",
            "الدفع كاش",
            "ادفع كاش",
            "دفع عالباب",
            "دفع على الباب",
        ),
    ),
    Topic(
        "متوفر توصيل",
        (
            "متوفر توصيل",
            "في توصيل",
            "توصيل متاح",
            "متى بوصل الطلب",
            "ايمت بوصل الطلب",
            "كم يوم توصيل",
            "كم يوم ليوصل",
        ),
    ),
    Topic(
        "الغي الطلب",
        (
            "الغي الطلب",
            "الغى الطلب",
            "كنسل الطلب",
            "كنسل الطلبية",
            "ما بدي الطلب",
            "ما بدى الطلب",
            "ماريد الطلب",
            "ما اريد الطلب",
        ),
    ),
    Topic(
        "بدي فكر",
        (
            "بدي فكر",
            "بدي افكر",
            "راح افكر",
            "راح فكر",
            "افكر واخبرك",
            "نفكر ونخبرك",
            "خليني شوف",
        ),
    ),
    Topic(
        "مكان الشركة",
        (
            "مكان الشركة",
            "مكان الشركه",
            "وين محلك",
            "وين مكانكم",
            "مكانكم وين",
            "محلكم وين",
        ),
    ),
    Topic(
        "والله خايفه",
        (
            "والله خايفه",
            "والله خايفة",
            "خايفه من الشراء الاونلاين",
            "خايفة من الشراء الاونلاين",
            "خايفه اطلب",
            "خايفة اطلب",
            "اخاف اطلب",
            "حايفه اطلب",
            "حايفة اطلب",
        ),
    ),
    Topic(
        "شو الضمان",
        (
            "شو الضمان",
            "شو ضمان",
            "الضمان شو",
            "ضمان شو",
            "شو كفالته",
            "معه كفاله",
            "معه كفالة",
            "كيف اضمن",
        ),
    ),
    Topic(
        "بدي افتح الطلب",
        (
            "بدي افتح الطلب",
            "فيني افتح الطلب",
            "بقدر افتح الطلب",
            "بدي شوف طلبي قبل ما ادفع",
            "بقدر اعاين المنتج",
            "اقدر اعين المنتج",
            "اقدر اشوف الطلب",
        ),
    ),
    Topic(
        "طريقة الاستخدام",
        (
            "طريقة الاستخدام",
            "طريقه الاستخدام",
            "طريقة استخدام",
            "طريقه استخدام",
            "كيفية الاستعمال",
            "كيفيه الاستعمال",
            "كيف استخدمه",
            "كيف استعمله",
        ),
    ),
    Topic(
        "غالي",
        (
            "غالي",
            "غالية",
            "غاليه",
            "السعر غالي",
            "سعرها غالي",
            "سعرو غالي",
        ),
    ),
    Topic(
        "بدي احجز",
        (
            "بدي احجز",
            "احجزيلي",
            "ممكن احجز",
            "فيني احجز",
            "ثبتلي",
            "ثبتيلي الحجز",
            "بدي اثبت الحجز",
            "بدي اثبت الطلب",
        ),
    ),
)


_ARABIC_MARKS = re.compile(r"[\u064b-\u065f\u0670\u06d6-\u06ed]")
_NON_WORDS = re.compile(r"[^\w\u0600-\u06ff]+", re.UNICODE)
_WHITESPACE = re.compile(r"\s+")
_ARABIC_TRANSLATION = str.maketrans(
    {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
        "ة": "ه",
        "ؤ": "و",
        "ئ": "ي",
    }
)


def normalize_for_matching(value: str) -> str:
    """Normalize Arabic variants and spacing for identification only."""
    normalized = unicodedata.normalize("NFKC", value).lower().replace("ـ", "")
    normalized = _ARABIC_MARKS.sub("", normalized).translate(_ARABIC_TRANSLATION)
    normalized = _NON_WORDS.sub(" ", normalized)
    return _WHITESPACE.sub(" ", normalized).strip()


def rule_matches_topic(rule: AutomationRule, topic: Topic) -> bool:
    """Return whether a rule name or one of its keywords identifies a topic."""
    searchable_values = [rule.name or ""]
    searchable_values.extend(
        keyword
        for keyword in (rule.keywords or [])
        if isinstance(keyword, str)
    )
    normalized_values = [normalize_for_matching(value) for value in searchable_values]
    normalized_phrases = [
        normalize_for_matching(phrase) for phrase in topic.match_phrases
    ]
    return any(
        phrase and phrase in value
        for value in normalized_values
        for phrase in normalized_phrases
    )


def union_keywords(rules: list[AutomationRule]) -> list[str]:
    """Union exact trimmed keywords while retaining source and keyword order."""
    consolidated: list[str] = []
    seen: set[str] = set()

    for rule in rules:
        for keyword in rule.keywords or []:
            if not isinstance(keyword, str):
                continue
            cleaned = keyword.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            consolidated.append(cleaned)

    return consolidated


def consolidated_page_responses(
    rules: list[AutomationRule],
    active_page_ids: list[str],
    fallback_response: str,
) -> dict[str, str]:
    """Resolve one response for every active page, then use the primary fallback."""
    page_specific: dict[str, str] = {}

    # Explicit page mappings are the strongest source of page-specific text.
    for rule in rules:
        if not isinstance(rule.page_responses, dict):
            continue
        for page_id, response_text in rule.page_responses.items():
            normalized_page_id = str(page_id).strip()
            if (
                normalized_page_id in active_page_ids
                and normalized_page_id not in page_specific
                and isinstance(response_text, str)
                and response_text.strip()
            ):
                page_specific[normalized_page_id] = response_text

    # A page-scoped rule's response is the next-best page-specific source.
    for rule in rules:
        page_id = str(rule.page_id or "").strip()
        if (
            page_id in active_page_ids
            and page_id not in page_specific
            and isinstance(rule.response_text, str)
            and rule.response_text.strip()
        ):
            page_specific[page_id] = rule.response_text

    return {
        page_id: page_specific.get(page_id, fallback_response)
        for page_id in active_page_ids
    }


async def consolidate_negotiation_rules() -> tuple[int, int, int]:
    """Consolidate all configured topics atomically and return summary metrics."""
    async with AsyncSessionLocal() as session:
        try:
            page_result = await session.execute(
                select(ConnectedPage.page_id)
                .where(ConnectedPage.status == "ACTIVE")
                .order_by(ConnectedPage.created_at.asc(), ConnectedPage.page_id.asc())
            )
            active_page_ids = list(
                dict.fromkeys(
                    page_id.strip()
                    for page_id in page_result.scalars().all()
                    if isinstance(page_id, str) and page_id.strip()
                )
            )

            rule_result = await session.execute(
                select(AutomationRule)
                .order_by(AutomationRule.created_at.asc(), AutomationRule.id.asc())
                .with_for_update()
            )
            all_rules = list(rule_result.scalars().all())

            matches_by_topic: list[tuple[Topic, list[AutomationRule]]] = []
            topics_by_rule_id: dict[object, list[str]] = {}
            for topic in TOPICS:
                matching_rules = [
                    rule for rule in all_rules if rule_matches_topic(rule, topic)
                ]
                matches_by_topic.append((topic, matching_rules))
                for rule in matching_rules:
                    topics_by_rule_id.setdefault(rule.id, []).append(topic.name)

            ambiguous = {
                rule_id: topic_names
                for rule_id, topic_names in topics_by_rule_id.items()
                if len(topic_names) > 1
            }
            if ambiguous:
                details = "; ".join(
                    f"{rule_id}: {', '.join(topic_names)}"
                    for rule_id, topic_names in ambiguous.items()
                )
                raise RuntimeError(
                    "Refusing to consolidate rules that match multiple topics: "
                    f"{details}"
                )

            topics_consolidated = 0
            secondary_rule_ids: list[object] = []

            for topic, matching_rules in matches_by_topic:
                if not matching_rules:
                    logger.info("No existing rules found for topic '%s'.", topic.name)
                    continue

                primary, *secondary_rules = matching_rules
                primary.keywords = union_keywords(matching_rules)
                primary.page_responses = consolidated_page_responses(
                    matching_rules,
                    active_page_ids,
                    primary.response_text,
                )
                primary.channels = ["messenger"]
                primary.is_active = True
                primary.name = f"قاعدة: {topic.name}"

                secondary_rule_ids.extend(rule.id for rule in secondary_rules)
                topics_consolidated += 1
                logger.info(
                    "Topic '%s': primary=%s, matched_rules=%d, keywords=%d, pages=%d",
                    topic.name,
                    primary.id,
                    len(matching_rules),
                    len(primary.keywords),
                    len(primary.page_responses),
                )

            if secondary_rule_ids:
                await session.execute(
                    delete(AutomationRule).where(
                        AutomationRule.id.in_(secondary_rule_ids)
                    )
                )

            await session.flush()
            remaining_clean_rules_count = int(
                (
                    await session.execute(
                        select(func.count()).select_from(AutomationRule)
                    )
                ).scalar_one()
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception(
                "Negotiation rule consolidation failed; transaction rolled back."
            )
            raise

    secondary_rules_deleted = len(secondary_rule_ids)
    logger.info(
        "Consolidation complete: topics_consolidated=%d, "
        "secondary_rules_deleted=%d, remaining_clean_rules_count=%d",
        topics_consolidated,
        secondary_rules_deleted,
        remaining_clean_rules_count,
    )
    print(
        "METRICS_SUMMARY: "
        f"topics_consolidated={topics_consolidated}, "
        f"secondary_rules_deleted={secondary_rules_deleted}, "
        f"remaining_clean_rules_count={remaining_clean_rules_count}"
    )
    return (
        topics_consolidated,
        secondary_rules_deleted,
        remaining_clean_rules_count,
    )


def main() -> None:
    """Run the async migration entry point."""
    asyncio.run(consolidate_negotiation_rules())


if __name__ == "__main__":
    main()
