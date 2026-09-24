#!/usr/bin/env python3
"""
Import, name, and synchronize legacy automation rules into PostgreSQL `automation_rules`.
1. Assign semantic, human-readable names to all rules based on their trigger keywords.
2. Ingest rules for each respective page ID using deterministic UUIDs.
3. Replicate and activate ALL 132 rules for Lotus Blue Cosmetic (page_id: 101509818947526).
4. Ensure connected_pages has `is_automation_enabled = true` for all target pages.
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

LOTUS_BLUE_PAGE_ID = "101509818947526"
LOTUS_BLUE_BRAND = "Lotus blue cosmetic"

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
        "expected_count": 51,
    },
    {
        "filename": "page_100736899432829.json",
        "alt_names": ["config (4).json"],
        "page_id": "100736899432829",
        "brand": "LOXX KING MAN",
        "expected_count": 27,
    },
    {
        "filename": "page_104710089055383.json",
        "alt_names": ["config (5).json"],
        "page_id": "104710089055383",
        "brand": "Hayat Cosmetics",
        "expected_count": 26,
    },
    {
        "filename": "page_flare_config_6.json",
        "alt_names": ["config (6).json", "flare_config.json"],
        "page_id": "flare_page",
        "brand": "Flare",
        "expected_count": 0,
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


def get_rule_uuid(page_id: str, source_id: str) -> uuid.UUID:
    """Generate deterministic, collision-free UUIDs per page and source rule."""
    return uuid.uuid5(uuid.NAMESPACE_DNS, f"crm_auto_rule_{page_id}_{source_id}")


def generate_semantic_rule_name(keywords: list[str], fallback_prefix: str = "قاعدة") -> str:
    """
    Generate an authentic, descriptive Arabic rule name based on trigger keywords.
    E.g.: 'قاعدة: استفسار السعر (مرحبا فاونديشن لوتس بلو)'
    """
    clean_kws = [k.strip() for k in keywords if k and k.strip()]
    combined = " ".join(k.lower() for k in clean_kws)
    
    first_kw = f" ({clean_kws[0][:40]})" if clean_kws else ""

    # 1. Price queries
    if any(w in combined for w in ["سعر", "بكم", "كام", "تكلفة", "فلوس", "اسعار", "بكام", "سعره", "سعرها", "بكام المشد"]):
        return f"{fallback_prefix}: استفسار السعر{first_kw}"

    # 2. Order confirmation / Booking
    if any(w in combined for w in ["حجز", "ثبت", "طلب", "اوردر", "اشتري", "ابعتلي", "احجز", "تثبيت", "اريد", "بدي احجز"]):
        return f"{fallback_prefix}: تأكيد وحجز الطلب{first_kw}"

    # 3. Shipping / Delivery
    if any(w in combined for w in ["توصيل", "شحن", "محافظات", "مصاريف", "مندوب", "ميعاد", "بيوصل", "المحافظات"]):
        return f"{fallback_prefix}: الشحن والتوصيل{first_kw}"

    # 4. Skin shades / Foundation
    if any(w in combined for w in ["بشرتي", "درجة", "درجه", "فاونديشن", "لون", "الوان", "تغطية", "كونسيلر"]):
        return f"{fallback_prefix}: درجات البشرة والفاونديشن{first_kw}"

    # 5. Skin problems / Treatment
    if any(w in combined for w in ["كلف", "هالات", "حبوب", "اثار", "تجاعيد", "مسام", "علاج", "تصبغات", "اكسدة", "جفاف"]):
        return f"{fallback_prefix}: مشاكل وعلاج البشرة{first_kw}"

    # 6. Offers / Discounts
    if any(w in combined for w in ["عرض", "عروض", "خصم", "خصومات", "هدية", "باكدج", "بكج", "تخفيض"]):
        return f"{fallback_prefix}: العروض والخصومات{first_kw}"

    # 7. How to use
    if any(w in combined for w in ["طريقة", "استخدام", "استعمال", "ازاي", "كيفية", "طريقه", "ازى"]):
        return f"{fallback_prefix}: طريقة الاستخدام{first_kw}"

    # 8. Locations / Branches
    if any(w in combined for w in ["عنوان", "مكان", "فرع", "فروع", "لوكيشن", "موقع", "المحل"]):
        return f"{fallback_prefix}: الفروع والعنوان{first_kw}"

    # 9. Product Details / Ingredients
    if any(w in combined for w in ["تفاصيل", "معلومات", "شرح", "مكونات", "عايزة اعرف", "عبارة عن ايه"]):
        return f"{fallback_prefix}: تفاصيل ومعلومات المنتج{first_kw}"

    # 10. Greetings
    if any(w in combined for w in ["مرحبا", "اهلا", "سلام", "صباح", "مساء", "الو", "هااي", "هالو", "السلام"]):
        return f"{fallback_prefix}: الترحيب والاستقبال{first_kw}"

    # Fallback name: "قاعدة: " + first 3 keywords joined by " / "
    if clean_kws:
        return f"{fallback_prefix}: {' / '.join(clean_kws[:3])}"
    return f"{fallback_prefix}: عامة"


async def run_import():
    logger.info("Starting legacy automation rules ingestion & semantic naming...")
    total_created = 0
    total_updated = 0
    total_skipped = 0

    all_parsed_rules = []

    async with AsyncSessionLocal() as session:
        # Step 1: Ingest rules for each respective page ID
        for spec in CONFIG_SPECS:
            page_id = spec["page_id"]
            brand = spec["brand"]
            fpath = resolve_file(spec)

            if not fpath:
                logger.warning("Configuration file for page_id=%s (%s) not found in search paths!", page_id, brand)
                continue

            logger.info("Processing spec for page_id=%s (%s) from file: %s", page_id, brand, fpath)
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_rules = data.get("rules", [])
            logger.info("Found %d rules in %s for page_id=%s", len(raw_rules), fpath.name, page_id)

            # Ensure page has automation enabled in connected_pages (if page_id is a real Facebook page)
            if page_id != "flare_page":
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
                reply = (r.get("reply") or "").strip()
                if not reply:
                    total_skipped += 1
                    continue

                raw_kws = r.get("keywords")
                if isinstance(raw_kws, list) and len(raw_kws) > 0:
                    keywords = [k.strip() for k in raw_kws if isinstance(k, str) and k.strip()]
                else:
                    kw_str = r.get("keyword") or ""
                    keywords = [k.strip() for k in kw_str.split(",") if k.strip()]

                if not keywords:
                    total_skipped += 1
                    continue

                match_type = (r.get("matchType") or "contains").lower().strip()
                if match_type not in ("exact", "contains", "regex"):
                    match_type = "contains"

                is_active = bool(r.get("active", True))
                semantic_name = generate_semantic_rule_name(keywords)
                source_id = str(r.get("id") or f"legacy_{page_id}_{idx}").strip()

                rule_dict = {
                    "source_id": source_id,
                    "original_page_id": page_id,
                    "original_brand": brand,
                    "name": semantic_name,
                    "reply": reply,
                    "keywords": keywords,
                    "match_type": match_type,
                    "is_active": is_active,
                }
                all_parsed_rules.append(rule_dict)

                rule_uuid = get_rule_uuid(page_id, source_id)
                existing = await session.get(AutomationRule, rule_uuid)

                if existing:
                    existing.name = semantic_name
                    existing.keywords = keywords
                    existing.match_type = match_type
                    existing.is_active = is_active
                    existing.brand_id = brand
                    existing.page_id = page_id
                    existing.response_text = reply
                    existing.split_lines = True
                    existing.delay_seconds = 2
                    existing.human_typing_simulation = True
                    existing.cooldown_minutes = 15
                    session.add(existing)
                    total_updated += 1
                else:
                    new_rule = AutomationRule(
                        id=rule_uuid,
                        name=semantic_name,
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

        # Step 2: Replicate and activate ALL 132 rules for Lotus Blue Cosmetic (101509818947526)
        logger.info("Replicating all %d rules across all suites for Lotus Blue Cosmetic...", len(all_parsed_rules))
        lotus_created = 0
        lotus_updated = 0

        # Ensure Lotus Blue page exists and has automation enabled
        lotus_cp_stmt = select(ConnectedPage).where(ConnectedPage.page_id == LOTUS_BLUE_PAGE_ID)
        lotus_cp = (await session.execute(lotus_cp_stmt)).scalars().first()
        if lotus_cp:
            lotus_cp.is_automation_enabled = True
            lotus_cp.status = "ACTIVE"
            session.add(lotus_cp)
            await session.commit()

        for r in all_parsed_rules:
            reply = r["reply"]
            keywords = r["keywords"]
            match_type = r["match_type"]
            semantic_name = r["name"]
            source_id = r["source_id"]

            lotus_rule_uuid = get_rule_uuid(LOTUS_BLUE_PAGE_ID, source_id)
            existing_lotus = await session.get(AutomationRule, lotus_rule_uuid)

            if existing_lotus:
                existing_lotus.name = semantic_name
                existing_lotus.keywords = keywords
                existing_lotus.match_type = match_type
                existing_lotus.is_active = True  # Always active for Lotus Blue
                existing_lotus.brand_id = LOTUS_BLUE_BRAND
                existing_lotus.page_id = LOTUS_BLUE_PAGE_ID
                existing_lotus.response_text = reply
                existing_lotus.split_lines = True
                existing_lotus.delay_seconds = 2
                existing_lotus.human_typing_simulation = True
                existing_lotus.cooldown_minutes = 15
                session.add(existing_lotus)
                lotus_updated += 1
            else:
                lotus_rule = AutomationRule(
                    id=lotus_rule_uuid,
                    name=semantic_name,
                    brand_id=LOTUS_BLUE_BRAND,
                    page_id=LOTUS_BLUE_PAGE_ID,
                    channels=["messenger", "instagram", "whatsapp"],
                    trigger_type="keyword_match",
                    match_type=match_type,
                    keywords=keywords,
                    response_text=reply,
                    split_lines=True,
                    delay_seconds=2,
                    human_typing_simulation=True,
                    cooldown_minutes=15,
                    is_active=True,
                )
                session.add(lotus_rule)
                lotus_created += 1

        await session.commit()
        logger.info("Lotus Blue replication complete: %d created, %d updated.", lotus_created, lotus_updated)

        # Step 3: Global semantic name normalization pass for any legacy rules
        all_rules_stmt = select(AutomationRule)
        all_db_rules = (await session.execute(all_rules_stmt)).scalars().all()
        renamed_count = 0
        for rule in all_db_rules:
            if not rule.name or rule.name.startswith("Rule_") or rule.name.isdigit():
                rule.name = generate_semantic_rule_name(rule.keywords or [])
                session.add(rule)
                renamed_count += 1
        if renamed_count > 0:
            await session.commit()
            logger.info("Renamed %d legacy rules to human-readable semantic names.", renamed_count)

    logger.info(
        "Overall ingestion complete: %d page-scoped created, %d updated, %d Lotus Blue rules synced.",
        total_created,
        total_updated,
        lotus_created + lotus_updated,
    )


if __name__ == "__main__":
    asyncio.run(run_import())
