import uuid
from datetime import datetime
from typing import Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ChannelEnum, MigrationStatusEnum, ProviderEnum
from app.models.migration import MigrationJob


class MigrationService:
    @staticmethod
    async def create_migration_job(
        session: AsyncSession,
        provider: ProviderEnum,
        channel: ChannelEnum,
    ) -> MigrationJob:
        job = MigrationJob(
            provider=provider,
            channel=channel,
            status=MigrationStatusEnum.PENDING,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return job

    @staticmethod
    async def get_migration_job(
        session: AsyncSession, job_id: uuid.UUID
    ) -> Optional[MigrationJob]:
        stmt = select(MigrationJob).where(MigrationJob.id == job_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def update_migration_status(
        session: AsyncSession,
        job_id: uuid.UUID,
        status: MigrationStatusEnum,
        error_entry: Optional[dict[str, Any]] = None,
    ) -> Optional[MigrationJob]:
        job = await MigrationService.get_migration_job(session, job_id)
        if not job:
            return None

        job.status = status
        now = datetime.now()
        if status == MigrationStatusEnum.RUNNING and not job.started_at:
            job.started_at = now
        elif status in (
            MigrationStatusEnum.COMPLETED,
            MigrationStatusEnum.COMPLETED_WITH_ERRORS,
            MigrationStatusEnum.FAILED,
        ):
            job.completed_at = now

        if error_entry:
            if job.error_log is None:
                job.error_log = []
            job.error_log.append(error_entry)

        await session.commit()
        await session.refresh(job)
        return job
