#!/usr/bin/env python3
"""Merge automation rules whose trimmed keyword sets are exactly identical.

For every duplicate group, the oldest rule is retained as the primary rule. Its
keyword list is never rewritten, so the original keyword order is preserved.
Responses from all participating pages are consolidated in ``page_responses``
before the redundant rules are deleted.
"""

import asyncio
import logging
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.models.automation import AutomationRule


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("DuplicateKeywordRuleMerger")


def keyword_key(rule: AutomationRule) -> tuple[str, ...]:
    """Return the required exact, count-sensitive key after trimming."""
    return tuple(
        sorted(
            [
                keyword.strip()
                for keyword in (rule.keywords or [])
                if isinstance(keyword, str) and keyword.strip()
            ]
        )
    )


def merge_page_responses(rules: list[AutomationRule]) -> dict[str, Any]:
    """Collect existing mappings and each rule's own page response.

    Existing mappings are copied first and remain authoritative if the same
    page appears more than once. A rule's ``response_text`` supplies the
    mapping for its own page only when that page has no existing override.
    """
    merged: dict[str, Any] = {}

    for rule in rules:
        existing = rule.page_responses
        if not isinstance(existing, dict):
            continue
        for page_id, response_text in existing.items():
            merged.setdefault(str(page_id), response_text)

    for rule in rules:
        if rule.page_id is None:
            continue
        page_id = str(rule.page_id).strip()
        if page_id:
            merged.setdefault(page_id, rule.response_text)

    return merged


async def merge_duplicate_keyword_rules() -> tuple[int, int, int]:
    """Merge duplicate-keyword rules atomically and return summary metrics."""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(AutomationRule)
                .order_by(AutomationRule.created_at.asc(), AutomationRule.id.asc())
                .with_for_update()
            )
            rules = list(result.scalars().all())
            total_rules_before = len(rules)

            groups: dict[tuple[str, ...], list[AutomationRule]] = defaultdict(list)
            for rule in rules:
                groups[keyword_key(rule)].append(rule)

            rules_merged = 0
            for duplicate_rules in groups.values():
                if len(duplicate_rules) < 2:
                    continue

                primary, *redundant_rules = duplicate_rules
                # Do not assign to primary.keywords: its exact list and order
                # must remain unchanged.
                primary.page_responses = merge_page_responses(duplicate_rules)
                primary.channels = ["messenger"]
                primary.is_active = True

                for redundant_rule in redundant_rules:
                    await session.delete(redundant_rule)
                    rules_merged += 1

            await session.flush()
            clean_rules_count_after = int(
                (
                    await session.execute(
                        select(func.count()).select_from(AutomationRule)
                    )
                ).scalar_one()
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Merge failed; the transaction was rolled back.")
            raise

    logger.info(
        "Merge complete: total_rules_before=%d, rules_merged=%d, "
        "clean_rules_count_after=%d",
        total_rules_before,
        rules_merged,
        clean_rules_count_after,
    )
    return total_rules_before, rules_merged, clean_rules_count_after


def main() -> None:
    asyncio.run(merge_duplicate_keyword_rules())


if __name__ == "__main__":
    main()
