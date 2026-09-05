import asyncio
import logging
from app.services.beon_sync_service import BeonSyncEngine

logger = logging.getLogger("app.workers.beon_worker")


async def start_beon_polling_worker(interval_seconds: int = 15):
    """
    Autonomous, non-blocking background polling daemon for BeOn Gateway V3.
    Continuously discovers newly arrived conversations and messages, persists them
    into PostgreSQL, and broadcasts real-time WebSocket events to frontend clients.
    """
    logger.info("[BeOn Worker] Started autonomous polling daemon (interval: %ds)...", interval_seconds)
    engine = BeonSyncEngine()

    # Initial short delay before first sync cycle
    await asyncio.sleep(2)

    while True:
        try:
            stats = await engine.sync_recent(limit=30)
            if stats.get("new_messages", 0) > 0 or stats.get("new_conversations", 0) > 0 or stats.get("updated_conversations", 0) > 0:
                logger.info(
                    "[BeOn Worker] Synchronized BeOn records: %d new convs, %d updated convs, %d new msgs (total checked: %d)",
                    stats.get("new_conversations", 0),
                    stats.get("updated_conversations", 0),
                    stats.get("new_messages", 0),
                    stats.get("synced_conversations", 0),
                )
        except asyncio.CancelledError:
            logger.info("[BeOn Worker] Received shutdown signal. Gracefully exiting BeOn daemon.")
            break
        except Exception as exc:
            logger.error("[BeOn Worker] Polling iteration encountered an error: %s", exc, exc_info=True)
            await asyncio.sleep(10)  # Brief backoff on network/server error

        try:
            await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            logger.info("[BeOn Worker] Sleep interrupted by shutdown signal. Gracefully exiting.")
            break
