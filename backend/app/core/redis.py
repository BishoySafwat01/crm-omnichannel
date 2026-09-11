from typing import AsyncGenerator
import redis.asyncio as aioredis
from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def get_redis_client() -> aioredis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.async_redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return redis_client


async def close_redis_client() -> None:
    global redis_client
    if redis_client is not None:
        client = redis_client
        redis_client = None
        if hasattr(client, "aclose"):
            await client.aclose()
        else:
            await client.close()


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    client = await get_redis_client()
    yield client
