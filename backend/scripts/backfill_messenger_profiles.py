import asyncio
import logging
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ProviderEnum, ChannelEnum
from app.services.customer_service import is_generic_display_name
from app.services.meta_import_service import MetaImportService
from app.integrations.meta.rate_limit import MetaRateLimitGuard

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backfill_messenger_profiles")


async def backfill():
    logger.info("Starting customer profile backfill for active conversations...")
    MetaRateLimitGuard.reset_cooldown()

    async with AsyncSessionLocal() as session:
        # Target customers associated with conversations
        stmt = (
            select(Customer, CustomerIdentity, Conversation)
            .join(CustomerIdentity, CustomerIdentity.customer_id == Customer.id)
            .join(Conversation, Conversation.customer_id == Customer.id)
            .where(CustomerIdentity.provider == ProviderEnum.META)
            .distinct()
        )
        result = await session.execute(stmt)
        rows = result.all()

        candidates_map = {}
        for cust, ident, conv in rows:
            if is_generic_display_name(cust.display_name):
                if cust.id not in candidates_map:
                    candidates_map[cust.id] = (cust, ident, conv)

        candidates = list(candidates_map.values())
        total = len(candidates)
        logger.info("Found %d conversation customers requiring profile resolution.", total)

        updated_count = 0
        failed_count = 0

        for cust, ident, conv in candidates:
            psid = ident.external_user_id
            old_name = cust.display_name or "[None]"
            logger.info("Resolving profile for PSID: %s (Current: '%s', Conv Brand: %s)...", psid, old_name, conv.brand)

            # Polite pause to stay well within Meta rate limits
            await asyncio.sleep(0.8)

            try:
                # If rate-limited, wait for cooldown
                if MetaRateLimitGuard.is_rate_limited():
                    wait_sec = int(MetaRateLimitGuard.get_cooldown_remaining()) + 5
                    logger.warning("Rate limit active. Sleeping %d seconds before continuing...", wait_sec)
                    await asyncio.sleep(wait_sec)

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
                if new_name:
                    cust.display_name = new_name
                    changed = True

                if new_avatar:
                    cust.avatar_url = new_avatar
                    changed = True

                if changed:
                    session.add(cust)
                    await session.commit()
                    updated_count += 1
                    logger.info(
                        "✅ [Updated] Cust %s (%s): '%s' -> '%s' | Avatar: %s",
                        cust.id,
                        psid,
                        old_name,
                        cust.display_name,
                        bool(cust.avatar_url),
                    )
                else:
                    failed_count += 1

            except Exception as exc:
                logger.error("Error backfilling PSID %s: %s", psid, exc)
                failed_count += 1

        logger.info(
            "Backfill Complete! Total: %d, Updated: %d, Failed: %d",
            total,
            updated_count,
            failed_count,
        )


if __name__ == "__main__":
    asyncio.run(backfill())
