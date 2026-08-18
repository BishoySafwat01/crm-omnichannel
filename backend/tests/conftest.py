import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import AsyncSessionLocal, engine
from app.main import app


@pytest_asyncio.fixture(autouse=True)
async def cleanup_db_and_engine():
    async with AsyncSessionLocal() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE messages, conversations, customer_identities, customers, migration_jobs, raw_events CASCADE;"
            )
        )
        await session.commit()
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
