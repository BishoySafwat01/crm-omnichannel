from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsOverviewResponse,
    BrandVolumeResponse,
    ChannelDistributionResponse,
    PeakHoursResponse,
    SlaMetricsResponse,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview_kpis(
    brand: Optional[str] = None,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return await AnalyticsService.get_overview_kpis(session=db, brand=brand, days=days)


@router.get("/channels", response_model=ChannelDistributionResponse)
async def get_channel_distribution(
    brand: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return await AnalyticsService.get_channel_distribution(session=db, brand=brand)


@router.get("/brands", response_model=BrandVolumeResponse)
async def get_brand_volume(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return await AnalyticsService.get_brand_volume(session=db)


@router.get("/peak-hours", response_model=PeakHoursResponse)
async def get_peak_hours(
    brand: Optional[str] = None,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return await AnalyticsService.get_peak_hours_distribution(session=db, brand=brand, days=days)


@router.get("/sla", response_model=SlaMetricsResponse)
async def get_sla_metrics(
    brand: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    return await AnalyticsService.get_sla_response_metrics(session=db, brand=brand)
