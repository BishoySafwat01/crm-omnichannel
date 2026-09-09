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


from sqlalchemy import select
from app.core.security import create_access_token
from app.models.user import User

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
async def auth_headers():
    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.email == TEST_SUPERADMIN_EMAIL)
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()
        if user:
            token = create_access_token(user.id)
            return {"Authorization": f"Bearer {token}"}
        return {}


@pytest_asyncio.fixture
async def async_client(auth_headers):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers
    ) as client:
        yield client


@pytest_asyncio.fixture
async def unauth_client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
