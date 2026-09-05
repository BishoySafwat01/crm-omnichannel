import os
import asyncio
import logging
import httpx
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.customer import Customer, CustomerIdentity
from app.models.enums import ChannelEnum, ProviderEnum
from app.core.config import settings
from app.services.customer_service import CustomerService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_customer_avatars")


async def sync_avatars():
    avatars_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    page_token = settings.META_PAGE_ACCESS_TOKEN
    page_id = settings.META_PAGE_ID or "1302055352987458"

    if not page_token:
        logger.error("META_PAGE_ACCESS_TOKEN is missing.")
        return

    psid_set = set()

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        # 1. Fetch conversations & participants from Meta Graph API
        convs_url = f"https://graph.facebook.com/v23.0/{page_id}/conversations?fields=id,participants&access_token={page_token}"
        try:
            res = await client.get(convs_url)
            if res.status_code == 200:
                data = res.json()
                for conv in data.get("data", []):
                    participants = conv.get("participants", {}).get("data", [])
                    for p in participants:
                        pid = p.get("id")
                        if pid and pid != page_id:
                            psid_set.add(pid)
        except Exception as e:
            logger.warning("Failed to fetch conversation participants from Meta Graph API: %s", e)

        # Also include existing identities in DB
        async with AsyncSessionLocal() as session:
            identities = (
                await session.execute(
                    select(CustomerIdentity).where(CustomerIdentity.provider == "meta")
                )
            ).scalars().all()
            for ident in identities:
                if ident.external_user_id and ident.external_user_id != page_id:
                    psid_set.add(ident.external_user_id)

        logger.info("Found %d total Meta customer PSIDs to sync avatars.", len(psid_set))

        async with AsyncSessionLocal() as session:
            for psid in psid_set:
                url = f"https://graph.facebook.com/v23.0/{psid}?fields=first_name,last_name,profile_pic&access_token={page_token}"
                try:
                    res = await client.get(url)
                    if res.status_code == 200:
                        pdata = res.json()
                        first_name = pdata.get("first_name", "")
                        last_name = pdata.get("last_name", "")
                        display_name = f"{first_name} {last_name}".strip()
                        pic_url = pdata.get("profile_pic")

                        dest_rel_url = None
                        if pic_url:
                            pic_res = await client.get(
                                pic_url,
                                headers={"Authorization": f"Bearer {page_token}"},
                            )
                            if pic_res.status_code == 200 and len(pic_res.content) > 500:
                                dest_file = f"avatar_{psid}.jpg"
                                dest_path = os.path.join(avatars_dir, dest_file)
                                with open(dest_path, "wb") as f:
                                    f.write(pic_res.content)
                                dest_rel_url = f"/uploads/avatars/{dest_file}"

                        # Get or create customer and identity
                        customer, _ = await CustomerService.get_or_create_customer_with_identity(
                            session=session,
                            provider=ProviderEnum.META,
                            channel=ChannelEnum.MESSENGER,
                            external_user_id=psid,
                            display_name=display_name or "عميل",
                        )

                        if dest_rel_url:
                            customer.avatar_url = dest_rel_url
                        if display_name:
                            customer.display_name = display_name
                        session.add(customer)
                        logger.info("Synced avatar for PSID %s (%s) -> %s", psid, customer.display_name, customer.avatar_url)
                except Exception as e:
                    logger.warning("Failed to fetch avatar for PSID %s: %s", psid, e)

            await session.commit()
            logger.info("Avatar synchronization completed successfully.")


if __name__ == "__main__":
    asyncio.run(sync_avatars())
