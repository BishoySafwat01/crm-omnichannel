#!/usr/bin/env python3
"""
Import, name, and synchronize legacy automation rules into PostgreSQL `automation_rules`.
1. Enforce strict 1:1 page-level isolation based on Facebook Page IDs extracted from inboxUrls.
2. Filter out corrupted, inverted, and cross-pollinated cross-brand rules.
3. Assign semantic, human-readable Arabic names to all rules based on their trigger keywords.
4. Ingest rules for each respective page ID using deterministic UUIDs.
5. Verify exact expected counts per page (Lotus Blue: 40, LOXX KING: 25, Lavva: 25, Hayat: 23, Liora: 3, Total: 116).
6. Ensure connected_pages has `is_automation_enabled = true` for all target pages.
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

from sqlalchemy import func, select, text
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
        "alt_names": ["config.json", "config_2.json"],
        "page_id": "103412619187974",
        "brand": "Lavva",
        "expected_count": 25,
    },
    {
        "filename": "page_801569813029844.json",
        "alt_names": ["config (2).json", "config (2)_2.json"],
        "page_id": "801569813029844",
        "brand": "Liora",
        "expected_count": 3,
    },
    {
        "filename": "page_101509818947526.json",
        "alt_names": ["config (3).json", "config (3)_2.json"],
        "page_id": "101509818947526",
        "brand": "Lotus blue cosmetic",
        "expected_count": 40,
    },
    {
        "filename": "page_100736899432829.json",
        "alt_names": ["config (4).json", "config (4)_2.json"],
        "page_id": "100736899432829",
        "brand": "LOXX KING MAN",
        "expected_count": 25,
    },
    {
        "filename": "page_104710089055383.json",
        "alt_names": ["config (5).json", "config (5)_2.json"],
        "page_id": "104710089055383",
        "brand": "Hayat Cosmetics",
        "expected_count": 23,
    },
    {
        "filename": "page_flare_config_6.json",
        "alt_names": ["config (6).json", "flare_config.json"],
        "page_id": "flare_page",
        "brand": "Flare",
        "expected_count": 0,
    },
]

# Explicit exclusion sets for corrupted, inverted, duplicate, or cross-pollinated rules
EXCLUDED_RULE_IDS = {
    # Lotus Blue: exclude 8 country price rules for mascara copied from Hayat + 3 cross-pollinated mascara/corset rules (51 -> 40)
    "101509818947526": {
        "rule_1789744202475",  # LY mascara price
        "rule_1789744401109",  # IQ mascara price
        "rule_1789744491590",  # TR mascara price
        "rule_1789744541429",  # OM mascara price
        "rule_1789744623237",  # AE mascara price
        "rule_1789744686327",  # BH mascara price
        "rule_1789744697141",  # KW mascara price
        "rule_1789744702269",  # QA mascara price
        "rule_1789748626001",  # Mascara waterproof rule
        "rule_1789748696360",  # Mascara/Corset cross-pollinated rule
        "rule_1789748939047",  # Mascara all problems rule
    },
    # LOXX KING: exclude 1 inverted rule + 1 identical duplicate rule (27 -> 25)
    "100736899432829": {
        "rule_1789634614329",  # Inverted rule (reply text placed in keywords)
        "rule_1789636169840",  # Duplicate of rule_1789635001313
    },
    # Hayat Cosmetics: exclude 1 corset cross-pollinated rule + 1 duplicate/contradiction + 1 duplicate country price (26 -> 23)
    "104710089055383": {
        "rule_1789754676988",  # Corset cross-pollinated rule (keywords mention مشد ضد الماء)
        "rule_1789754630273",  # Contradictory waterproof rule duplicating Lotus Blue
        "rule_1789754071577",  # Duplicate identical response text of rule_1789754065801
    },
}

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
    logger.info("Starting legacy automation rules ingestion with STRICT 1:1 page-level isolation...")
    total_created = 0
    total_skipped = 0

    async with AsyncSessionLocal() as session:
        # Step 1: Purge existing rules to enforce clean 1:1 page isolation
        logger.info("Truncating automation_rules table CASCADE to reset rules cleanly...")
        await session.execute(text("TRUNCATE TABLE automation_rules CASCADE;"))
        await session.commit()

        # Step 2: Ingest rules strictly into their extracted Page ID
        for spec in CONFIG_SPECS:
            page_id = spec["page_id"]
            brand = spec["brand"]
            expected_count = spec.get("expected_count", 0)
            fpath = resolve_file(spec)

            if not fpath:
                logger.warning("Configuration file for page_id=%s (%s) not found in search paths!", page_id, brand)
                continue

            logger.info("Processing spec for page_id=%s (%s) from file: %s", page_id, brand, fpath)
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_rules = data.get("rules", [])
            logger.info("Found %d raw rules in %s for page_id=%s", len(raw_rules), fpath.name, page_id)

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

            page_created = 0
            page_exclusions = EXCLUDED_RULE_IDS.get(page_id, set())

            for idx, r in enumerate(raw_rules, start=1):
                source_id = str(r.get("id") or f"legacy_{page_id}_{idx}").strip()

                # Filter out corrupted, inverted, duplicate, or cross-pollinated rules
                if source_id in page_exclusions:
                    logger.info("Skipping excluded rule %s for page_id=%s (%s)", source_id, page_id, brand)
                    total_skipped += 1
                    continue

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
                rule_uuid = get_rule_uuid(page_id, source_id)

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
                page_created += 1
                total_created += 1

            await session.commit()
            logger.info("Successfully imported %d rules for page_id=%s (%s)", page_created, page_id, brand)
            if expected_count > 0 and page_created != expected_count:
                raise RuntimeError(f"Expected {expected_count} rules for page {page_id} ({brand}), but imported {page_created}")

        # Step 3: Verification & Audit Check
        stmt_verify = (
            select(AutomationRule.page_id, AutomationRule.brand_id, func.count(AutomationRule.id))
            .group_by(AutomationRule.page_id, AutomationRule.brand_id)
            .order_by(func.count(AutomationRule.id).desc())
        )
        res = (await session.execute(stmt_verify)).all()
        actual_counts = {row[0]: row[2] for row in res}
        total_rules = sum(actual_counts.values())

        logger.info("=== AUTOMATION RULES AUDIT VERIFICATION ===")
        for pid, b_name, count in res:
            logger.info("  Page ID: %-16s | Brand: %-22s | Rules: %d", pid, b_name, count)
        logger.info("  Total Rules in DB: %d", total_rules)

        expected_targets = {
            "101509818947526": 40,
            "100736899432829": 25,
            "103412619187974": 25,
            "104710089055383": 23,
            "801569813029844": 3,
        }

        for pid, exp in expected_targets.items():
            act = actual_counts.get(pid, 0)
            if act != exp:
                raise RuntimeError(f"Verification FAILED for page_id={pid}: expected {exp}, got {act}")

        if total_rules != 116:
            raise RuntimeError(f"Verification FAILED: expected 116 total rules, got {total_rules}")

        logger.info("SUCCESS: All 116 rules ingested with strict 1:1 page-level isolation.")


if __name__ == "__main__":
    asyncio.run(run_import())
