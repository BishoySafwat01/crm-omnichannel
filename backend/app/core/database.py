from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


import os
from sqlalchemy.pool import NullPool

pool_kwargs = {"pool_pre_ping": True}
if os.environ.get("PYTEST_CURRENT_TEST") or settings.ENVIRONMENT == "testing":
    pool_kwargs["poolclass"] = NullPool

engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    future=True,
    **pool_kwargs
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
