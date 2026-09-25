#!/usr/bin/env python3
"""
Deduplicate automation rule keywords in PostgreSQL `automation_rules`.
Strict exact-match only, order-preserving deduplication.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add backend directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.automation import AutomationRule

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("KeywordDeduplicator")


async def deduplicate_keywords():
    logger.info("Starting strict exact-match keyword deduplication across automation_rules...")
    async with AsyncSessionLocal() as session:
        stmt = select(AutomationRule).order_by(AutomationRule.created_at.asc())
        res = await session.execute(stmt)
        rules = res.scalars().all()

        total_rules = len(rules)
        cleaned_rules_count = 0
        total_duplicates_removed = 0

        for rule in rules:
            original_kws = rule.keywords or []
            # Strict exact string match only with whitespace stripping and order preservation
            deduped_kws = list(dict.fromkeys([k.strip() for k in original_kws if isinstance(k, str) and k.strip()]))

            if len(deduped_kws) != len(original_kws):
                diff = len(original_kws) - len(deduped_kws)
                cleaned_rules_count += 1
                total_duplicates_removed += diff
                logger.info(
                    "Rule ID: %s | Name: '%s' | Page: %s | Original: %d keywords -> Deduped: %d keywords (Removed: %d duplicates)",
                    rule.id,
                    rule.name,
                    rule.page_id,
                    len(original_kws),
                    len(deduped_kws),
                    diff,
                )
                rule.keywords = deduped_kws
                session.add(rule)

        if cleaned_rules_count > 0:
            await session.commit()
            logger.info("Successfully committed keyword deduplication changes to database.")
        else:
            logger.info("No duplicate keywords found. Database is already clean.")

        logger.info(
            "Deduplication complete. Scanned: %d rules | Cleaned: %d rules | Total duplicate keyword entries eliminated: %d",
            total_rules,
            cleaned_rules_count,
            total_duplicates_removed,
        )

        return cleaned_rules_count, total_duplicates_removed


if __name__ == "__main__":
    cleaned, dupes = asyncio.run(deduplicate_keywords())
    print(f"METRICS_SUMMARY: cleaned_rules={cleaned}, duplicates_removed={dupes}")
