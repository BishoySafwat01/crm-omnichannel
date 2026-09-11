import asyncio
import logging
from app.core.database import AsyncSessionLocal
from app.services.meta_import_service import MetaImportService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_meta_conversations")


async def main():
    logger.info("Starting historical Meta Messenger sync...")
    async with AsyncSessionLocal() as session:
        job = await MetaImportService.run_import(session=session)
        logger.info("Meta historical sync completed!")
        logger.info(f"Job ID: {job.id}")
        logger.info(f"Status: {job.status.value}")
        logger.info(f"Total Conversations Found: {job.total_conversations}")
        logger.info(f"Processed Conversations: {job.processed_conversations}")
        logger.info(f"Total Messages Processed: {job.processed_messages}")
        if job.error_log:
            logger.warning(f"Error Log: {job.error_log}")


if __name__ == "__main__":
    asyncio.run(main())
