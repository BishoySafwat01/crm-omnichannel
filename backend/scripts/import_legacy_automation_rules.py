#!/usr/bin/env python3
"""
Import and sync legacy automation rules from extracted JSON configuration files
into PostgreSQL `automation_rules`, mapping strictly to their respective Facebook Page IDs.
"""

import asyncio
import json
import logging
import os
import sys
import uuid
from pathlib import Path

# Add backend directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.automation import AutomationRule
from app.models.connected_page import ConnectedPage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("LegacyRuleImporter")

CONFIG_SPECS = [
    {
        "filename": "page_103412619187974.json",
        "alt_names": ["config.json"],
        "page_id": "103412619187974",
        "brand": "Lavva",
        "expected_count": 25,
    },
    {
        "filename": "page_801569813029844.json",
        "alt_names": ["config (2).json"],
        "page_id": "801569813029844",
        "brand": "Liora",
        "expected_count": 3,
    },
    {
        "filename": "page_101509818947526.json",
        "alt_names": ["config (3).json"],
        "page_id": "101509818947526",
        "brand": "Lotus blue cosmetic",
        "expected_count": 40,
    },
    {
        "filename": "page_100736899432829.json",
        "alt_names": ["config (4).json"],
        "page_id": "100736899432829",
        "brand": "LOXX KING MAN",
        "expected_count": 25,
    },
    {
        "filename": "page_104710089055383.json",
        "alt_names": ["config (5).json"],
        "page_id": "104710089055383",
        "brand": "Hayat Cosmetics",
        "expected_count": 23,
    },
]

SEARCH_DIRS = [
    SCRIPT_DIR / "data" / "legacy_rules",
    Path("/home/bishoy/Downloads/MetaInboxBot_Profiles"),
    Path.home() / "Downloads" / "MetaInboxBot_Profiles",
    Path("/home/bishoy/Downloads"),
    Path.cwd(),
]


def resolve_file(spec: dict) -> Path | None:
    candidates = [spec["filename"]] + spec.get("alt_names", [])
    for d in SEARCH_DIRS:
        if not d.exists():
            continue
        for name in candidates:
            p = d / name
            if p.is_file():
                return p
    return None


async def run_import():
    logger.info("Starting legacy automation rules ingestion into PostgreSQL...")
    total_created = 0
    total_updated = 0
    total_skipped = 0

    async with AsyncSessionLocal() as session:
        for spec in CONFIG_SPECS:
            page_id = spec["page_id"]
            brand = spec["brand"]
            fpath = resolve_file(spec)

            if not fpath:
                logger.error("Configuration file for page_id=%s (%s) not found in search paths!", page_id, brand)
                continue

            logger.info("Processing spec for page_id=%s (%s) from file: %s", page_id, brand, fpath)
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_rules = data.get("rules", [])
            logger.info("Found %d rules in %s for page_id=%s", len(raw_rules), fpath.name, page_id)

            # Ensure page has automation enabled if registered in connected_pages (or create if missing)
            from app.models.workspace import DEFAULT_WORKSPACE_ID
            from app.services.connected_page_service import ConnectedPageService
            from app.core.config import settings

            cp_stmt = select(ConnectedPage).where(ConnectedPage.page_id == page_id)
            cp_res = await session.execute(cp_stmt)
            connected_page = cp_res.scalars().first()
            if connected_page:
                connected_page.is_automation_enabled = True
                connected_page.status = "ACTIVE"
                session.add(connected_page)
            else:
                token = settings.get_page_token(page_id) or settings.META_PAGE_ACCESS_TOKEN or "placeholder_token"
                enc_token = ConnectedPageService.encrypt_token(token) if token else ""
                connected_page = ConnectedPage(
                    id=uuid.uuid4(),
                    workspace_id=DEFAULT_WORKSPACE_ID,
                    page_id=page_id,
                    name=brand,
                    encrypted_access_token=enc_token,
                    category="Business Page",
                    status="ACTIVE",
                    is_webhook_subscribed=True,
                    is_automation_enabled=True,
                )
                session.add(connected_page)

            for idx, r in enumerate(raw_rules, start=1):
                name = (r.get("name") or r.get("id") or f"Rule_{page_id}_{idx}").strip()
                reply = (r.get("reply") or "").strip()
                if not reply:
                    logger.warning("Skipping rule with empty reply (ID: %s)", r.get("id"))
                    total_skipped += 1
                    continue

                # Parse keywords
                raw_kws = r.get("keywords")
                if isinstance(raw_kws, list) and len(raw_kws) > 0:
                    keywords = [k.strip() for k in raw_kws if isinstance(k, str) and k.strip()]
                else:
                    kw_str = r.get("keyword") or ""
                    keywords = [k.strip() for k in kw_str.split(",") if k.strip()]

                if not keywords:
                    logger.warning("Skipping rule with no valid keywords: %s", name)
                    total_skipped += 1
                    continue

                match_type = (r.get("matchType") or "contains").lower().strip()
                if match_type not in ("exact", "contains", "regex"):
                    match_type = "contains"

                is_active = bool(r.get("active", True))

                # Check existing rule for idempotency
                rule_stmt = select(AutomationRule).where(
                    AutomationRule.page_id == page_id,
                    (AutomationRule.name == name) | (AutomationRule.response_text == reply)
                )
                existing = (await session.execute(rule_stmt)).scalars().first()

                if existing:
                    # Update fields
                    existing.keywords = keywords
                    existing.match_type = match_type
                    existing.is_active = is_active
                    existing.brand_id = brand
                    existing.response_text = reply
                    existing.split_lines = True
                    existing.delay_seconds = 2
                    existing.human_typing_simulation = True
                    existing.cooldown_minutes = 15
                    session.add(existing)
                    total_updated += 1
                else:
                    new_rule = AutomationRule(
                        id=uuid.uuid4(),
                        name=name,
                        brand_id=brand,
                        page_id=page_id,
                        channels=["messenger", "instagram", "whatsapp"],
                        trigger_type="keyword_match",
                        match_type=match_type,
                        keywords=keywords,
                        response_text=reply,
                        split_lines=True,
                        delay_seconds=2,
                        human_typing_simulation=True,
                        cooldown_minutes=15,
                        is_active=is_active,
                    )
                    session.add(new_rule)
                    total_created += 1

            await session.commit()

    logger.info(
        "Ingestion complete: %d rules created, %d updated, %d skipped.",
        total_created,
        total_updated,
        total_skipped,
    )


if __name__ == "__main__":
    asyncio.run(run_import())
