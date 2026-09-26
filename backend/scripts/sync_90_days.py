"""Import 90 days of Meta conversations for every connected page."""

import asyncio
import logging
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import AsyncSessionLocal
from app.services.meta_import_service import MetaImportService


LOOKBACK_DAYS = 90


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    logger = logging.getLogger("sync_90_days")
    logger.info("Starting %d-day Meta backlog sync", LOOKBACK_DAYS)

    async with AsyncSessionLocal() as session:
        jobs = await MetaImportService.sync_all_configured_pages(
            session=session,
            since_days=LOOKBACK_DAYS,
        )

    failed_jobs = 0
    for job in jobs:
        status = job.status.value if hasattr(job.status, "value") else str(job.status)
        logger.info(
            "Job %s: status=%s conversations=%d/%d messages=%d/%d",
            job.id,
            status,
            job.processed_conversations,
            job.total_conversations,
            job.processed_messages,
            job.total_messages,
        )
        if status == "failed":
            failed_jobs += 1

    if failed_jobs:
        raise SystemExit(f"{failed_jobs} Meta page sync job(s) failed")


if __name__ == "__main__":
    asyncio.run(main())
