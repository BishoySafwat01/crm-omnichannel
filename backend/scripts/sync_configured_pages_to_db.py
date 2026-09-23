#!/usr/bin/env python3
import asyncio
import logging
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, "/app")

from sqlalchemy import select
from sqlalchemy.sql import func

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.connected_page import ConnectedPage
from app.models.workspace import Workspace
from app.services.connected_page_service import ConnectedPageService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("sync_configured_pages")


async def main():
    async with AsyncSessionLocal() as session:
        ws_stmt = select(Workspace).order_by(Workspace.created_at.asc()).limit(1)
        ws_res = await session.execute(ws_stmt)
        default_ws = ws_res.scalar_one_or_none()
        default_ws_id = default_ws.id if default_ws else None

        pages = settings.get_meta_pages()
        logger.info("Found %d configured pages in settings.", len(pages))

        for pid, pdata in pages.items():
            pid_str = str(pid).strip()
            name = pdata.get("name", "Connected Page")
            token = pdata.get("access_token", "")
            category = pdata.get("category", "")

            stmt = select(ConnectedPage).where(ConnectedPage.page_id == pid_str)
            res = await session.execute(stmt)
            page = res.scalar_one_or_none()

            enc_token = ConnectedPageService.encrypt_token(token) if token else ""

            if page:
                page.name = name
                if enc_token:
                    page.encrypted_access_token = enc_token
                page.status = "ACTIVE"
                page.category = category
                page.updated_at = func.now()
                logger.info("Updated ConnectedPage: %s (%s)", pid_str, name)
            else:
                new_page = ConnectedPage(
                    id=uuid.uuid4(),
                    workspace_id=default_ws_id,
                    page_id=pid_str,
                    name=name,
                    encrypted_access_token=enc_token,
                    category=category,
                    status="ACTIVE",
                    is_webhook_subscribed=True,
                )
                session.add(new_page)
                logger.info("Inserted ConnectedPage: %s (%s)", pid_str, name)

        await session.commit()
        logger.info("All configured pages synced to connected_pages.")


if __name__ == "__main__":
    asyncio.run(main())
