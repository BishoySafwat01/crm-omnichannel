#!/usr/bin/env python3
"""
Ingest newly generated Meta User Access Token:
1. Call GET /me/accounts and direct page query with LONG_LIVED_USER_TOKEN.
2. Retrieve permanent Page Access Tokens for Lotus Blue pages.
3. Validate via debug_token endpoint (showing expires_at == 0 and app_id == 2138720486721927).
4. Fernet encrypt and upsert ConnectedPage in PostgreSQL (crm_omnichannel_v16).
5. Subscribe pages to Meta Webhook events (subscribed_apps).
"""

import os
import sys

# Ensure /app and backend dir are in python path
sys.path.insert(0, "/app")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend")))

import asyncio
import json
import logging
import uuid
import httpx
from sqlalchemy import select
from sqlalchemy.sql import func

from app.core.database import AsyncSessionLocal
from app.models.connected_page import ConnectedPage
from app.models.workspace import Workspace
from app.services.connected_page_service import ConnectedPageService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("meta_token_ingest")

APP_ID = "2138720486721927"
APP_SECRET = "cfb803c2089a7de02783b0b4277805ab"
LONG_LIVED_USER_TOKEN = "EAAeZAJ6riiYcBShWZB4vpWrKna7GMKNZBrDqlVnGYIchqfp2cmRNY92ZAcE1Fo0Ps5rJtR23uR1sPDwKiI674K7UPAV7pfkixyW14sxwDuQZABg3bCt2qHTM0XNPZAKV6GgKWNDi9uy3OtKZCi6joIW2RlrMWGMY5GAiZBD6OI2yA6bRZBA460Vi8xSn9hFL0AvIuv6whhNvlRFPZA"

TARGET_PAGES = {
    "101509818947526": "Lotus blue cosmetic",
    "1144890542050640": "Lotus Blue"
}

GRAPH_VERSION = "v23.0"
SUBSCRIBED_FIELDS = "messages,messaging_postbacks,message_echoes,standby"


async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        # STEP 1.1: Retrieve Page Access Tokens from /me/accounts
        logger.info("====================================================================")
        logger.info("STEP 1.1: Retrieving Page Access Tokens from /me/accounts")
        logger.info("====================================================================")
        accounts_url = f"https://graph.facebook.com/{GRAPH_VERSION}/me/accounts"
        accounts_params = {
            "access_token": LONG_LIVED_USER_TOKEN,
            "limit": 100
        }
        resp = await client.get(accounts_url, params=accounts_params)
        logger.info("Accounts response status: %s", resp.status_code)
        
        extracted_pages = {}
        if resp.status_code == 200:
            accounts_data = resp.json()
            pages = accounts_data.get("data", [])
            logger.info("Found %d pages in Meta user account via /me/accounts", len(pages))
            for p in pages:
                pid = str(p.get("id"))
                pname = p.get("name")
                ptoken = p.get("access_token")
                pcat = p.get("category")
                if pid in TARGET_PAGES:
                    extracted_pages[pid] = {
                        "name": pname,
                        "access_token": ptoken,
                        "category": pcat
                    }

        # Resolve target pages directly via /{page_id}
        for target_id, target_name in TARGET_PAGES.items():
            if target_id not in extracted_pages:
                logger.info("Querying Graph API directly for target page ID: %s (%s)...", target_id, target_name)
                page_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{target_id}"
                page_params = {
                    "access_token": LONG_LIVED_USER_TOKEN,
                    "fields": "id,name,access_token,category"
                }
                p_resp = await client.get(page_url, params=page_params)
                if p_resp.status_code == 200:
                    p_data = p_resp.json()
                    extracted_pages[target_id] = {
                        "name": p_data.get("name", target_name),
                        "access_token": p_data.get("access_token"),
                        "category": p_data.get("category")
                    }
                    logger.info("Directly retrieved page token for %s (%s)", target_id, p_data.get("name"))
                else:
                    logger.error("FATAL: Could not retrieve token for %s: %s", target_id, p_resp.text)
                    sys.exit(1)

        # STEP 1.2: Verify Non-Expiring Status (debug_token)
        logger.info("====================================================================")
        logger.info("STEP 1.2: Verifying Non-Expiring Status (debug_token)")
        logger.info("====================================================================")
        debug_results = {}
        for pid, pinfo in extracted_pages.items():
            debug_url = f"https://graph.facebook.com/{GRAPH_VERSION}/debug_token"
            debug_params = {
                "input_token": pinfo["access_token"],
                "access_token": f"{APP_ID}|{APP_SECRET}"
            }
            d_resp = await client.get(debug_url, params=debug_params)
            if d_resp.status_code != 200:
                logger.error("debug_token failed for %s: %s", pid, d_resp.text)
                sys.exit(1)
            d_data = d_resp.json().get("data", {})
            debug_results[pid] = d_data
            
            print(f"\n--- DEBUG_TOKEN VALIDATION FOR PAGE: {pinfo['name']} (ID: {pid}) ---")
            debug_fields = {
                "app_id": d_data.get("app_id"),
                "type": d_data.get("type"),
                "profile_id": d_data.get("profile_id"),
                "is_valid": d_data.get("is_valid"),
                "issued_at": d_data.get("issued_at"),
                "expires_at": d_data.get("expires_at"),
                "data_access_expires_at": d_data.get("data_access_expires_at"),
                "scopes": d_data.get("scopes")
            }
            print(json.dumps(debug_fields, indent=2))
            
            assert d_data.get("expires_at") == 0, f"Token for {pid} is not permanent (expires_at={d_data.get('expires_at')})"
            assert str(d_data.get("app_id")) == APP_ID, f"Token app_id mismatch: {d_data.get('app_id')}"
            assert d_data.get("is_valid") is True, f"Token for {pid} is invalid"
            print(f"CONFIRMATION: Page {pid} expires_at == 0 (PERMANENT / NEVER EXPIRES) & app_id == {APP_ID}!\n")

        # STEP 1.3: Fernet Encrypt & Upsert in PostgreSQL
        logger.info("====================================================================")
        logger.info("STEP 1.3: Fernet Encrypt & Upsert into PostgreSQL (crm_omnichannel_v16)")
        logger.info("====================================================================")
        async with AsyncSessionLocal() as session:
            ws_stmt = select(Workspace).order_by(Workspace.created_at.asc()).limit(1)
            ws_res = await session.execute(ws_stmt)
            default_ws = ws_res.scalar_one_or_none()
            default_ws_id = default_ws.id if default_ws else None
            logger.info("Target Workspace ID: %s", default_ws_id)

            for pid, pinfo in extracted_pages.items():
                raw_token = pinfo["access_token"]
                encrypted_token = ConnectedPageService.encrypt_token(raw_token)
                logger.info("Encrypted token for page %s (ciphertext length: %d)", pid, len(encrypted_token))

                # Verify decryption roundtrip
                decrypted_check = ConnectedPageService.decrypt_token(ConnectedPage(encrypted_access_token=encrypted_token))
                assert decrypted_check == raw_token, f"Decryption check failed for {pid}"
                logger.info("Fernet decrypt roundtrip verified successfully for %s", pid)

                # Check if page exists in DB
                stmt = select(ConnectedPage).where(ConnectedPage.page_id == pid)
                res = await session.execute(stmt)
                existing_page = res.scalar_one_or_none()

                if existing_page:
                    logger.info("Updating existing ConnectedPage: %s (%s)", pid, pinfo["name"])
                    existing_page.name = pinfo["name"]
                    existing_page.encrypted_access_token = encrypted_token
                    if pinfo.get("category"):
                        existing_page.category = pinfo["category"]
                    existing_page.status = "ACTIVE"
                    existing_page.is_webhook_subscribed = True
                    existing_page.updated_at = func.now()
                else:
                    logger.info("Inserting new ConnectedPage: %s (%s)", pid, pinfo["name"])
                    new_page = ConnectedPage(
                        id=uuid.uuid4(),
                        workspace_id=default_ws_id,
                        page_id=pid,
                        name=pinfo["name"],
                        encrypted_access_token=encrypted_token,
                        category=pinfo.get("category"),
                        status="ACTIVE",
                        is_webhook_subscribed=True,
                    )
                    session.add(new_page)

                await session.commit()
                logger.info("PostgreSQL record committed for page_id: %s", pid)

        # STEP 1.4: Webhook Subscription (subscribed_apps)
        logger.info("====================================================================")
        logger.info("STEP 1.4: Meta Webhook Subscription (subscribed_apps)")
        logger.info("====================================================================")
        for pid, pinfo in extracted_pages.items():
            sub_url = f"https://graph.facebook.com/{GRAPH_VERSION}/{pid}/subscribed_apps"
            sub_params = {
                "subscribed_fields": SUBSCRIBED_FIELDS,
                "access_token": pinfo["access_token"]
            }
            s_resp = await client.post(sub_url, params=sub_params)
            logger.info("subscribed_apps response for %s: Status %d, Body: %s", pid, s_resp.status_code, s_resp.text)
            sub_json = s_resp.json()
            if s_resp.status_code == 200 and sub_json.get("success") is True:
                logger.info("SUCCESS: Subscribed page %s to fields [%s]", pid, SUBSCRIBED_FIELDS)
            else:
                logger.error("FAILED to subscribe page %s: %s", pid, s_resp.text)
                sys.exit(1)

        # Output Summary JSON
        output_summary = {
            "long_lived_user_token": LONG_LIVED_USER_TOKEN,
            "pages": {
                pid: {
                    "name": pinfo["name"],
                    "token": pinfo["access_token"],
                    "category": pinfo["category"],
                    "expires_at": debug_results[pid].get("expires_at"),
                    "is_valid": debug_results[pid].get("is_valid"),
                    "app_id": debug_results[pid].get("app_id")
                }
                for pid, pinfo in extracted_pages.items()
            }
        }
        print("\n=== SUMMARY_JSON_OUTPUT_START ===")
        print(json.dumps(output_summary))
        print("=== SUMMARY_JSON_OUTPUT_END ===\n")
        logger.info("ALL STEP 1 ACTIONS COMPLETED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(main())
