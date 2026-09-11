import os
import secrets

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.database import AsyncSessionLocal
from app.core.test_context import purge_test_fixtures
from app.main import app
from scripts.seed_superadmin import seed_superadmin

# Dedicated test admin to prevent modifying or resetting real admin accounts
TEST_SUPERADMIN_EMAIL = "test_admin_ephemeral@luxira.internal"
os.environ.setdefault("SEED_SUPERADMIN_EMAIL", TEST_SUPERADMIN_EMAIL)
os.environ.setdefault("SEED_SUPERADMIN_PASSWORD", secrets.token_urlsafe(16))


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db():
    # Pre-test teardown to ensure pristine DB state
    await purge_test_fixtures(test_prefix="__TEST__")
    await seed_superadmin()
    try:
        yield
    finally:
        # Post-test automated teardown
        await purge_test_fixtures(test_prefix="__TEST__")


@pytest_asyncio.fixture
async def async_client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
