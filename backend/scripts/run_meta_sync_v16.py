import asyncio
import logging
from app.core.database import AsyncSessionLocal
from app.services.meta_import_service import MetaImportService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("run_meta_sync_v16")


async def main():
    logger.info("Initializing Meta Historical Sync Runner for crm_omnichannel_v16...")
    async with AsyncSessionLocal() as session:
        jobs = await MetaImportService.sync_all_configured_pages(session=session)
        print("\n" + "=" * 80)
        print("META MULTI-PAGE HISTORICAL SYNC RESULTS")
        print("=" * 80)
        for job in jobs:
            print(f"- Job ID: {job.id}")
            print(f"  Channel: {job.channel.value if hasattr(job.channel, 'value') else job.channel}")
            print(f"  Status: {job.status.value if hasattr(job.status, 'value') else job.status}")
            print(f"  Total Convs: {job.total_conversations}, Processed: {job.processed_conversations}")
            print(f"  Total Msgs: {job.total_messages}, Processed: {job.processed_messages}")
            if job.error_log:
                print(f"  Error Log: {job.error_log}")
            print("-" * 40)


if __name__ == "__main__":
    asyncio.run(main())
