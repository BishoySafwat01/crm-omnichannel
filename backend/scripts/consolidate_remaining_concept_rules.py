#!/usr/bin/env python3
"""Consolidate remaining cross-page product and medical concept rules.

Only concepts represented by more than one rule are changed. The oldest rule
is retained, page-specific replies are collected for active connected pages,
and all updates and deletions are committed in one transaction.
"""

import asyncio
import logging
import re
import sys
import unicodedata
import uuid
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
logger = logging.getLogger("RemainingConceptRuleConsolidator")


@dataclass(frozen=True)
class Concept:
    """Definition of one targeted concept consolidation group."""

    label: str
    trigger_phrases: tuple[str, ...]
    target_name: str
    excluded_phrases: tuple[str, ...] = ()


NON_WATERPROOF_PHRASES = (
    "مش ضد الما",
    "مش ضد المياه",
    "ماسكارا عادية",
    "ماسكارا عاديه",
    "مسكرا عاديه",
    "تنشال بسهولة",
)


CONCEPTS: tuple[Concept, ...] = (
    Concept(
        label="عرق النسا",
        trigger_phrases=("عرق النسا", "عرق نسا", "العصب الوركي"),
        target_name="قاعدة: علاج عرق النسا والفقرات",
    ),
    Concept(
        label="ترهلات بعد الولادة",
        trigger_phrases=(
            "ترهلات بعد الولادة",
            "ترهلات بعد الولاده",
            "قيصرية",
            "قيصريه",
            "بعد ولادة",
            "بعد ولاده",
        ),
        target_name="قاعدة: ترهلات بعد الولادة والعمليات",
    ),
    Concept(
        label="الام الظهر",
        trigger_phrases=(
            "الام الظهر",
            "الم الظهر",
            "وجع الظهر",
            "فقرات الظهر",
            "وجع بالظهر",
        ),
        target_name="قاعدة: دعم الظهر وتخفيف الآلام",
    ),
    Concept(
        label="نحت الخصر",
        trigger_phrases=(
            "نحت الخصر",
            "نحت خصر",
            "ارسم خصري",
            "تحديد الخصر",
        ),
        target_name="قاعدة: نحت ورسم الخصر",
    ),
    Concept(
        label="ماسكارا ضد الماء",
        trigger_phrases=(
            "ضد الماء",
            "waterproof",
            "مقاومة للماء",
            "مقاومه للماء",
        ),
        target_name="قاعدة: ماسكارا ضد الماء وثباتها",
        excluded_phrases=NON_WATERPROOF_PHRASES,
    ),
    Concept(
        label="ماسكارا غير ضد الماء",
        trigger_phrases=NON_WATERPROOF_PHRASES,
        target_name="قاعدة: ماسكارا سهلة الإزالة (عادية)",
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
    """Normalize spelling variants for matching without altering stored data."""
    normalized = unicodedata.normalize("NFKC", value).lower().replace("ـ", "")
    normalized = _ARABIC_MARKS.sub("", normalized).translate(_ARABIC_TRANSLATION)
    normalized = _NON_WORDS.sub(" ", normalized)
    return _WHITESPACE.sub(" ", normalized).strip()


def rule_matches_concept(rule: AutomationRule, concept: Concept) -> bool:
    """Match a concept against a rule's name and keyword values."""
    searchable_values = [rule.name or ""]
    searchable_values.extend(
        keyword
        for keyword in (rule.keywords or [])
        if isinstance(keyword, str)
    )
    normalized_values = [normalize_for_matching(value) for value in searchable_values]
    normalized_triggers = [
        normalize_for_matching(phrase) for phrase in concept.trigger_phrases
    ]
    normalized_exclusions = [
        normalize_for_matching(phrase) for phrase in concept.excluded_phrases
    ]

    if any(
        phrase and phrase in value
        for value in normalized_values
        for phrase in normalized_exclusions
    ):
        return False

    return any(
        phrase and phrase in value
        for value in normalized_values
        for phrase in normalized_triggers
    )


def merge_keywords(rules: list[AutomationRule]) -> list[str]:
    """Merge exact, non-empty keywords while preserving their original order."""
    return list(
        dict.fromkeys(
            keyword.strip()
            for rule in rules
            for keyword in (rule.keywords or [])
            if isinstance(keyword, str) and keyword.strip()
        )
    )


def consolidate_page_responses(
    rules: list[AutomationRule], active_page_ids: set[str]
) -> dict[str, str]:
    """Collect existing and rule-owned responses for active connected pages."""
    consolidated: dict[str, str] = {}

    # Preserve any page mappings from an earlier partial consolidation.
    for rule in rules:
        if not isinstance(rule.page_responses, dict):
            continue
        for page_id, response_text in rule.page_responses.items():
            normalized_page_id = str(page_id).strip()
            if (
                normalized_page_id in active_page_ids
                and normalized_page_id not in consolidated
                and isinstance(response_text, str)
                and response_text.strip()
            ):
                consolidated[normalized_page_id] = response_text

    # Each page-scoped matching rule supplies that active page's reply text.
    for rule in rules:
        page_id = str(rule.page_id or "").strip()
        if (
            page_id in active_page_ids
            and page_id not in consolidated
            and isinstance(rule.response_text, str)
            and rule.response_text.strip()
        ):
            consolidated[page_id] = rule.response_text

    return consolidated


async def consolidate_remaining_concept_rules() -> tuple[int, int, int]:
    """Merge targeted duplicate concepts atomically and return summary metrics."""
    async with AsyncSessionLocal() as session:
        try:
            page_result = await session.execute(
                select(ConnectedPage.page_id).where(
                    ConnectedPage.status == "ACTIVE"
                )
            )
            active_page_ids = {
                page_id.strip()
                for page_id in page_result.scalars().all()
                if isinstance(page_id, str) and page_id.strip()
            }

            rule_result = await session.execute(
                select(AutomationRule)
                .order_by(AutomationRule.created_at.asc(), AutomationRule.id.asc())
                .with_for_update()
            )
            all_rules = list(rule_result.scalars().all())

            concepts_merged = 0
            secondary_rule_ids: list[uuid.UUID] = []

            for concept in CONCEPTS:
                matching_rules = [
                    rule
                    for rule in all_rules
                    if rule_matches_concept(rule, concept)
                    and rule.id not in secondary_rule_ids
                ]
                if len(matching_rules) <= 1:
                    logger.info(
                        "Concept '%s' has %d matching rule(s); no merge needed.",
                        concept.label,
                        len(matching_rules),
                    )
                    continue

                primary, *secondary_rules = matching_rules
                primary.keywords = merge_keywords(matching_rules)
                primary.page_responses = consolidate_page_responses(
                    matching_rules, active_page_ids
                )
                primary.channels = ["messenger"]
                primary.is_active = True
                primary.name = concept.target_name

                secondary_rule_ids.extend(rule.id for rule in secondary_rules)
                concepts_merged += 1
                logger.info(
                    "Concept '%s': primary=%s, matched_rules=%d, "
                    "keywords=%d, page_responses=%d",
                    concept.label,
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
            final_clean_count = int(
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
                "Concept rule consolidation failed; transaction rolled back."
            )
            raise

    deleted_rules_count = len(secondary_rule_ids)
    logger.info(
        "Consolidation complete: concepts_merged=%d, deleted_rules_count=%d, "
        "final_clean_count=%d",
        concepts_merged,
        deleted_rules_count,
        final_clean_count,
    )
    print(
        "METRICS_SUMMARY: "
        f"concepts_merged={concepts_merged}, "
        f"deleted_rules_count={deleted_rules_count}, "
        f"final_clean_count={final_clean_count}"
    )
    return concepts_merged, deleted_rules_count, final_clean_count


def main() -> None:
    """Run the async migration entry point."""
    asyncio.run(consolidate_remaining_concept_rules())


if __name__ == "__main__":
    main()
