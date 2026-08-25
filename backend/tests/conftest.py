import os
import secrets

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.main import app
from scripts.seed_superadmin import seed_superadmin

# Dedicated test admin to prevent modifying or resetting real admin accounts
TEST_SUPERADMIN_EMAIL = "test_admin_ephemeral@luxira.internal"
os.environ.setdefault("SEED_SUPERADMIN_EMAIL", TEST_SUPERADMIN_EMAIL)
os.environ.setdefault("SEED_SUPERADMIN_PASSWORD", secrets.token_urlsafe(16))


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db():
    # Only clean up test-generated ephemeral users to protect real users & data
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "DELETE FROM users WHERE "
                "email LIKE '%@luxira.internal' "
                "OR email LIKE '%@test%' "
                "OR email LIKE '%_test@%' "
                "OR email LIKE 'test_%' "
                "OR email IN ('agent_test@luxira.com', 'admin_subscribe@luxira.com', 'admin_fail@luxira.com');"
            )
        )
        await session.commit()

    await seed_superadmin()


@pytest_asyncio.fixture
async def async_client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
