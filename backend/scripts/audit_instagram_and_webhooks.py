import asyncio
import json
import logging
from typing import Any, Dict, List
import httpx
from sqlalchemy import select, update

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.connected_page import ConnectedPage
from app.services.connected_page_service import ConnectedPageService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_instagram_and_webhooks")

GRAPH_VERSION = getattr(settings, "META_GRAPH_API_VERSION", "v23.0")


async def run_audit():
    logger.info("=== STARTING LIVE META GRAPH API & WEBHOOK AUDIT (Graph API %s) ===", GRAPH_VERSION)
    
    pages_to_check: Dict[str, Dict[str, Any]] = {}

    # 1. Fetch DB connected pages
    async with AsyncSessionLocal() as session:
        stmt = select(ConnectedPage).where(ConnectedPage.deleted_at.is_(None))
        result = await session.execute(stmt)
        db_pages = result.scalars().all()

        for p in db_pages:
            try:
                decrypted = ConnectedPageService.decrypt_token(p)
            except Exception as e:
                logger.error("Failed to decrypt token for DB page %s: %s", p.page_id, e)
                decrypted = ""
            pages_to_check[str(p.page_id)] = {
                "name": p.name,
                "token": decrypted,
                "source": "database",
                "status": p.status,
                "db_ig_id": p.instagram_business_account_id,
                "is_subscribed": p.is_webhook_subscribed,
                "db_id": p.id,
            }

    # 2. Fetch pages from settings.META_PAGES_CONFIG to ensure coverage (including 1144890542050640)
    config_pages = settings.get_meta_pages()
    for pid, pdata in config_pages.items():
        clean_pid = str(pid).strip()
        tok = pdata.get("access_token") or ""
        if clean_pid not in pages_to_check:
            pages_to_check[clean_pid] = {
                "name": pdata.get("name") or f"Config Page {clean_pid}",
                "token": tok,
                "source": "config",
                "status": "CONFIG_ONLY",
                "db_ig_id": None,
                "is_subscribed": False,
                "db_id": None,
            }
        else:
            # If DB token is empty but config has one, use config token
            if not pages_to_check[clean_pid]["token"] and tok:
                pages_to_check[clean_pid]["token"] = tok

    logger.info("Total unique pages to audit: %d", len(pages_to_check))

    audit_summary = []

    async with httpx.AsyncClient(timeout=25.0) as client:
        for page_id, info in pages_to_check.items():
            logger.info("----------------------------------------------------------------------")
            logger.info("Auditing Page ID: %s (%s) [Source: %s, DB Status: %s]", page_id, info["name"], info["source"], info["status"])
            
            token = info["token"]
            if not token:
                logger.error("❌ No access token available for page %s! Skipping.", page_id)
                audit_summary.append({
                    "page_id": page_id,
                    "name": info["name"],
                    "error": "Missing access token",
                })
                continue

            summary_item = {
                "page_id": page_id,
                "name": info["name"],
                "source": info["source"],
                "token_valid": False,
                "ig_linked": False,
                "ig_id": None,
                "ig_username": None,
                "ig_name": None,
                "page_subscribed_apps": [],
                "ig_subscribed_apps": [],
                "ig_subscribed_success": None,
            }

            # 1. Query Page & Instagram Business Account
            page_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{page_id}"
            params = {
                "fields": "id,name,instagram_business_account{id,username,name,profile_picture_url}",
                "access_token": token,
            }
            try:
                resp = await client.get(page_url, params=params)
                if resp.status_code == 200:
                    summary_item["token_valid"] = True
                    data = resp.json()
                    page_name = data.get("name", info["name"])
                    summary_item["name"] = page_name
                    ig_data = data.get("instagram_business_account")
                    if ig_data:
                        summary_item["ig_linked"] = True
                        summary_item["ig_id"] = ig_data.get("id")
                        summary_item["ig_username"] = ig_data.get("username")
                        summary_item["ig_name"] = ig_data.get("name")
                        logger.info(
                            "✅ LINKED Instagram Business Account FOUND: @%s (ID: %s, Name: %s)",
                            summary_item["ig_username"],
                            summary_item["ig_id"],
                            summary_item["ig_name"],
                        )
                    else:
                        logger.info("ℹ️ No Instagram Business Account linked to Facebook page %s (%s)", page_id, page_name)
                else:
                    logger.warning("❌ Failed to query page %s info (HTTP %d): %s", page_id, resp.status_code, resp.text)
            except Exception as e:
                logger.error("⚠️ Exception querying page %s: %s", page_id, e)

            # 2. Query Page Subscribed Apps
            sub_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{page_id}/subscribed_apps"
            try:
                sub_resp = await client.get(sub_url, params={"access_token": token})
                if sub_resp.status_code == 200:
                    sub_data = sub_resp.json().get("data", [])
                    summary_item["page_subscribed_apps"] = sub_data
                    logger.info("Page %s Subscribed Apps: %s", page_id, json.dumps(sub_data, ensure_ascii=False))
                else:
                    logger.warning("❌ Failed to query subscribed_apps for page %s (HTTP %d): %s", page_id, sub_resp.status_code, sub_resp.text)
            except Exception as e:
                logger.error("⚠️ Exception querying subscribed_apps for page %s: %s", page_id, e)

            # 3. If Instagram Business Account is linked, check & subscribe its webhooks
            ig_id = summary_item["ig_id"]
            if ig_id:
                ig_sub_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{ig_id}/subscribed_apps"
                # Check current IG subscriptions
                try:
                    ig_sub_resp = await client.get(ig_sub_url, params={"access_token": token})
                    if ig_sub_resp.status_code == 200:
                        ig_sub_data = ig_sub_resp.json().get("data", [])
                        summary_item["ig_subscribed_apps"] = ig_sub_data
                        logger.info("Instagram Account %s Subscribed Apps: %s", ig_id, json.dumps(ig_sub_data, ensure_ascii=False))
                    else:
                        logger.warning("❌ GET IG subscribed_apps for %s failed (HTTP %d): %s", ig_id, ig_sub_resp.status_code, ig_sub_resp.text)
                except Exception as e:
                    logger.error("⚠️ Exception querying IG subscribed_apps for %s: %s", ig_id, e)

                # Execute POST subscribed_apps for Instagram Account
                try:
                    ig_post_params = {
                        "subscribed_fields": "messages,messaging_postbacks,messaging_seen,comments",
                        "access_token": token,
                    }
                    post_resp = await client.post(ig_sub_url, params=ig_post_params)
                    logger.info("POST IG subscribed_apps for %s (HTTP %d): %s", ig_id, post_resp.status_code, post_resp.text)
                    if post_resp.status_code == 200:
                        summary_item["ig_subscribed_success"] = post_resp.json().get("success", True)
                    else:
                        summary_item["ig_subscribed_success"] = False
                except Exception as e:
                    logger.error("⚠️ Exception subscribing IG %s to webhooks: %s", ig_id, e)
                    summary_item["ig_subscribed_success"] = False

                # Update database column if page exists in DB
                if info["db_id"]:
                    try:
                        async with AsyncSessionLocal() as session:
                            await session.execute(
                                update(ConnectedPage)
                                .where(ConnectedPage.id == info["db_id"])
                                .values(instagram_business_account_id=ig_id)
                            )
                            await session.commit()
                            logger.info("💾 Updated DB connected_pages row %s with instagram_business_account_id=%s", info["db_id"], ig_id)
                    except Exception as e:
                        logger.error("⚠️ Failed to update DB row with IG ID: %s", e)

            audit_summary.append(summary_item)

    print("\n======================= FINAL AUDIT SUMMARY =======================")
    print(json.dumps(audit_summary, indent=2, ensure_ascii=False))
    return audit_summary

if __name__ == "__main__":
    asyncio.run(run_audit())
