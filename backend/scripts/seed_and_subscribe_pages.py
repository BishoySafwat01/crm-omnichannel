#!/usr/bin/env python3
"""
Seed and Subscribe Lotus Blue Pages to Production Meta App 'LUXIRA 1'.

Performs:
1. Fernet encryption of raw access tokens via ConnectedPageService.encrypt_token().
2. Database upsert of ConnectedPage records in PostgreSQL (crm_omnichannel_v16).
3. Meta Graph API subscribed_apps activation for messages, messaging_postbacks, message_echoes, standby.
"""

import asyncio
import logging
import os
import sys
import uuid
import httpx

# Ensure app is discoverable on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, "/app")

from sqlalchemy import select
from sqlalchemy.sql import func

from app.core.database import AsyncSessionLocal
from app.models.connected_page import ConnectedPage
from app.models.workspace import Workspace
from app.services.connected_page_service import ConnectedPageService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_and_subscribe_pages")

PAGES_TO_SEED = [
    {
        "page_id": "101509818947526",
        "name": "Lotus blue cosmetic",
        "raw_token": "EAAeZAJ6riiYcBSoOZACCb0QDZBbrGh6MG2jr9F6oggZBDJW5nQijqMZAC89eaf0OtFsv89J7aoAZAk4mZAtxHNSr5TukFkgoeFY6EXmLrZC1d78n4noQ035fpUuPuH1MB8RNt3zt2OC1pUkmV8ESG1RMqVY1FOQStEd84MLxrZBKjCzeTQGZBcqhGAxtn420KRlhcWxrLqUevDWtBn3742HrsZD",
        "category": "مستحضرات تجميل",
    },
    {
        "page_id": "1144890542050640",
        "name": "Lotus Blue",
        "raw_token": "EAAeZAJ6riiYcBSrU37o9STCkW3ZAco2hk69Af5ZANJZBy7JgiRZCplgo1z7KKzPuMZCu8W6NaWuvDUXNaKcrZAHiq4ZB14vayOqpjqsZADr9xPFqRYVLLU5Om6l168YXFXwlTZA663qfKCyI4WZB9dlpVZAt2pkRZCE1NN3ZC1ImW2nJDzngLjRZAlPp0uN8LajDNfG2bCZAofNizGZBnCutQMq1rRnoR",
        "category": "اختصاصي تجميل",
    },
]

META_GRAPH_VERSION = "v23.0"
SUBSCRIBED_FIELDS = "messages,messaging_postbacks,message_echoes,standby"


async def subscribe_page_to_meta(page_id: str, raw_token: str) -> dict:
    url = f"https://graph.facebook.com/{META_GRAPH_VERSION}/{page_id}/subscribed_apps"
    params = {
        "subscribed_fields": SUBSCRIBED_FIELDS,
        "access_token": raw_token,
    }
    logger.info("Subscribing page %s to Meta webhook fields: %s", page_id, SUBSCRIBED_FIELDS)
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(url, params=params)
        logger.info("Meta response for %s: Status %d, Body: %s", page_id, res.status_code, res.text)
        return {
            "status_code": res.status_code,
            "response": res.text,
            "success": res.status_code == 200 and res.json().get("success", False),
        }


async def seed_database():
    async with AsyncSessionLocal() as session:
        # Check default workspace
        ws_stmt = select(Workspace).order_by(Workspace.created_at.asc()).limit(1)
        ws_res = await session.execute(ws_stmt)
        default_ws = ws_res.scalar_one_or_none()
        default_ws_id = default_ws.id if default_ws else None
        logger.info("Using default workspace ID: %s", default_ws_id)

        for page_data in PAGES_TO_SEED:
            page_id = page_data["page_id"]
            name = page_data["name"]
            raw_token = page_data["raw_token"]
            category = page_data.get("category")

            # 1. Encrypt token via ConnectedPageService
            encrypted_token = ConnectedPageService.encrypt_token(raw_token)
            logger.info("Encrypted token for %s (len: %d)", page_id, len(encrypted_token))

            # 2. Check if page already exists in DB
            stmt = select(ConnectedPage).where(ConnectedPage.page_id == page_id)
            res = await session.execute(stmt)
            existing_page = res.scalar_one_or_none()

            if existing_page:
                logger.info("Updating existing ConnectedPage: %s (%s)", page_id, name)
                existing_page.name = name
                existing_page.encrypted_access_token = encrypted_token
                existing_page.category = category
                existing_page.status = "ACTIVE"
                existing_page.is_webhook_subscribed = True
                existing_page.updated_at = func.now()
            else:
                logger.info("Inserting new ConnectedPage: %s (%s)", page_id, name)
                new_page = ConnectedPage(
                    id=uuid.uuid4(),
                    workspace_id=default_ws_id,
                    page_id=page_id,
                    name=name,
                    encrypted_access_token=encrypted_token,
                    category=category,
                    status="ACTIVE",
                    is_webhook_subscribed=True,
                )
                session.add(new_page)

            await session.commit()
            logger.info("Persisted ConnectedPage for page_id: %s", page_id)

            # 3. Call Meta Graph API subscribed_apps
            sub_res = await subscribe_page_to_meta(page_id, raw_token)
            if sub_res["success"]:
                logger.info("Successfully subscribed page %s (%s) to Meta Webhooks.", page_id, name)
            else:
                logger.warning("Subscription returned non-success for %s: %s", page_id, sub_res)


async def main():
    logger.info("Starting seed and subscribe workflow...")
    await seed_database()
    logger.info("Seed and subscribe workflow completed successfully.")


if __name__ == "__main__":
    asyncio.run(main())
