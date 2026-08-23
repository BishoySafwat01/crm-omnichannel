import asyncio
import logging
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_superadmin")


async def seed_superadmin():
    async with AsyncSessionLocal() as session:
        email = "admin@luxira.com"
        password = "admin123456"
        stmt = select(User).where(User.email == email)
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()

        if user:
            logger.info("Updating existing superadmin user: %s", email)
            user.password_hash = get_password_hash(password)
            user.full_name = "Luxira Superadmin"
            user.role = UserRole.ADMIN
            user.brand_access = ["ALL"]
            user.is_active = True
        else:
            logger.info("Creating new superadmin user: %s", email)
            user = User(
                email=email,
                password_hash=get_password_hash(password),
                full_name="Luxira Superadmin",
                role=UserRole.ADMIN,
                brand_access=["ALL"],
                is_active=True,
            )
            session.add(user)

        await session.commit()
        await session.refresh(user)
        logger.info("✅ Superadmin user successfully seeded! (ID: %s, Email: %s)", user.id, user.email)


if __name__ == "__main__":
    asyncio.run(seed_superadmin())
