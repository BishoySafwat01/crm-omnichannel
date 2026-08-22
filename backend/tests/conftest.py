import os
import secrets

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.main import app
from scripts.seed_superadmin import seed_superadmin

# The test suite seeds a throwaway superadmin per session. Credentials are NOT
# hardcoded: the password is randomized for every run and only lives in-process.
TEST_SUPERADMIN_EMAIL = "admin@luxira.com"
os.environ.setdefault("SEED_SUPERADMIN_EMAIL", TEST_SUPERADMIN_EMAIL)
os.environ.setdefault("SEED_SUPERADMIN_PASSWORD", secrets.token_urlsafe(16))


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db():
    async with AsyncSessionLocal() as session:
        for table in [
            "customer_notes",
            "customer_timeline_events",
            "conversation_assignment_logs",
            "user_audit_logs",
            "messages",
            "social_comments",
            "automation_execution_logs",
            "automation_rules",
            "conversations",
            "customer_identities",
            "customers",
            "migration_jobs",
            "raw_events",
        ]:
            await session.execute(text(f"DELETE FROM {table};"))
        await session.execute(text("DELETE FROM users WHERE email != 'admin@luxira.com';"))
        await session.commit()

    await seed_superadmin()


@pytest_asyncio.fixture
async def async_client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
