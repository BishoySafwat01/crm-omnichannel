import asyncio
import logging
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ProviderEnum, ChannelEnum
from app.services.customer_service import is_generic_display_name
from app.services.meta_import_service import MetaImportService

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backfill_messenger_profiles")


async def backfill():
    logger.info("Starting customer profile backfill from Meta Graph API...")

    async with AsyncSessionLocal() as session:
        stmt = (
            select(CustomerIdentity)
            .options(selectinload(CustomerIdentity.customer))
            .where(CustomerIdentity.provider == ProviderEnum.META)
        )
        result = await session.execute(stmt)
        identities = result.scalars().all()

        total = len(identities)
        logger.info("Found %d total Meta customer identities.", total)

        updated_count = 0
        skipped_count = 0
        failed_count = 0

        for ident in identities:
            customer = ident.customer
            if not customer:
                skipped_count += 1
                continue

            psid = ident.external_user_id
            old_name = customer.display_name or "[None]"
            old_avatar = customer.avatar_url or "[None]"

            needs_name = is_generic_display_name(customer.display_name)
            needs_avatar = not customer.avatar_url or customer.avatar_url.startswith("https://graph.facebook.com")

            if not needs_name and not needs_avatar:
                skipped_count += 1
                continue

            logger.info("Resolving profile for PSID: %s (Current Name: '%s', Channel: %s)...", psid, old_name, ident.channel)
            try:
                profile_info = await MetaImportService.fetch_and_cache_customer_profile(
                    psid=psid,
                    channel=ident.channel,
                )

                if not profile_info:
                    logger.warning("No profile data returned for PSID %s", psid)
                    failed_count += 1
                    continue

                new_name = profile_info.get("display_name") or profile_info.get("name")
                new_avatar = profile_info.get("avatar_url") or profile_info.get("profile_pic")

                changed = False
                if new_name and needs_name:
                    customer.display_name = new_name
                    changed = True

                if new_avatar and (not customer.avatar_url or customer.avatar_url.startswith("https://graph.facebook.com")):
                    customer.avatar_url = new_avatar
                    changed = True

                if changed:
                    session.add(customer)
                    await session.commit()
                    updated_count += 1
                    logger.info(
                        "✅ [Updated] PSID %s: '%s' -> '%s' | Avatar: '%s' -> '%s'",
                        psid,
                        old_name,
                        customer.display_name,
                        old_avatar,
                        customer.avatar_url,
                    )
                else:
                    skipped_count += 1

            except Exception as exc:
                logger.error("Error backfilling PSID %s: %s", psid, exc)
                failed_count += 1

        logger.info(
            "Backfill Complete! Total: %d, Updated: %d, Skipped: %d, Failed: %d",
            total,
            updated_count,
            skipped_count,
            failed_count,
        )


if __name__ == "__main__":
    asyncio.run(backfill())
