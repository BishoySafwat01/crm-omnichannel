import asyncio
import logging
import os

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.enums import UserRole
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_superadmin")

SEED_SUPERADMIN_EMAIL_ENV = "SEED_SUPERADMIN_EMAIL"
SEED_SUPERADMIN_PASSWORD_ENV = "SEED_SUPERADMIN_PASSWORD"


def _required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Refusing to seed superadmin: environment variable '{name}' is not set. "
            f"Provide credentials explicitly, e.g.:\n"
            f"  export {name}='<value>'\n"
            "Hardcoded default credentials are no longer supported."
        )
    return value


async def seed_superadmin() -> None:
    email = _required_env(SEED_SUPERADMIN_EMAIL_ENV)
    password = _required_env(SEED_SUPERADMIN_PASSWORD_ENV)

    async with AsyncSessionLocal() as session:
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
