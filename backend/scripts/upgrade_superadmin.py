import asyncio
import logging
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("upgrade_superadmin")


async def upgrade_users() -> None:
    async with AsyncSessionLocal() as session:
        # 1. Update or create bishoysafwat@luxira.com
        stmt = select(User).where(User.email == "bishoysafwat@luxira.com")
        res = await session.execute(stmt)
        bishoy_user = res.scalar_one_or_none()

        pw_hash = get_password_hash("bishoy/01")

        if bishoy_user:
            logger.info("Updating existing superadmin user: bishoysafwat@luxira.com")
            bishoy_user.full_name = "Bishoy Safwat"
            bishoy_user.role = UserRole.SUPERADMIN
            bishoy_user.password_hash = pw_hash
            bishoy_user.brand_access = ["ALL"]
            bishoy_user.channel_access = ["ALL"]
            bishoy_user.is_active = True
        else:
            logger.info("Creating new superadmin user: bishoysafwat@luxira.com")
            bishoy_user = User(
                email="bishoysafwat@luxira.com",
                password_hash=pw_hash,
                full_name="Bishoy Safwat",
                role=UserRole.SUPERADMIN,
                brand_access=["ALL"],
                channel_access=["ALL"],
                is_active=True,
            )
            session.add(bishoy_user)

        # 2. Deactivate legacy admin@luxira.com if it exists
        stmt_admin = select(User).where(User.email == "admin@luxira.com")
        res_admin = await session.execute(stmt_admin)
        admin_user = res_admin.scalar_one_or_none()
        if admin_user:
            logger.info("Deactivating legacy admin account: admin@luxira.com")
            admin_user.is_active = False

        await session.commit()
        if bishoy_user:
            await session.refresh(bishoy_user)
            logger.info(
                "✅ Superadmin successfully configured: %s (ID: %s, Role: %s, Active: %s)",
                bishoy_user.email,
                bishoy_user.id,
                bishoy_user.role,
                bishoy_user.is_active,
            )
        if admin_user:
            await session.refresh(admin_user)
            logger.info(
                "✅ Legacy admin account status: %s (ID: %s, Active: %s)",
                admin_user.email,
                admin_user.id,
                admin_user.is_active,
            )


if __name__ == "__main__":
    asyncio.run(upgrade_users())
