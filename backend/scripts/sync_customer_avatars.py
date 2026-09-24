import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_customer_avatars")


async def sync_avatars():
    """Avatar synchronization from Meta Graph API has been permanently disabled to protect app rate limits."""
    logger.info("Avatar synchronization from Meta Graph API is permanently disabled to protect app rate limits.")
    return


if __name__ == "__main__":
    asyncio.run(sync_avatars())
