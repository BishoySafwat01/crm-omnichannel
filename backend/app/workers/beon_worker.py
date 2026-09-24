import logging

logger = logging.getLogger("app.workers.beon_worker")


async def start_beon_polling_worker(interval_seconds: int = 15):
    """
    Autonomous background polling daemon for BeOn - DISABLED.
    LUXIRA CRM runs in pure Meta Direct mode.
    """
    logger.info("[BeOn Provider] Disabled - Running in pure Meta Direct mode.")
    return

