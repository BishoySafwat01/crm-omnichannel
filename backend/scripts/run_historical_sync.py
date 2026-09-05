import asyncio
import argparse
from app.services.meta_historical_sync_service import MetaHistoricalSyncService
from scripts.reconcile_last_messages import reconcile_conversations


async def main():
    parser = argparse.ArgumentParser(description="Deep Historical Meta Graph Sync")
    parser.add_argument("--platform", choices=["all", "messenger", "instagram"], default="all")
    parser.add_argument("--max-threads", type=int, default=50)
    args = parser.parse_args()

    service = MetaHistoricalSyncService()

    if args.platform in ["all", "messenger"]:
        await service.sync_all_historical_threads(platform=None, max_threads=args.max_threads)

    if args.platform in ["all", "instagram"]:
        await service.sync_all_historical_threads(platform="instagram", max_threads=args.max_threads)

    # Reconcile conversation previews and timestamps
    await reconcile_conversations()
    print("Full Historical Sync & Preview Reconciliation Complete.")


if __name__ == "__main__":
    asyncio.run(main())
