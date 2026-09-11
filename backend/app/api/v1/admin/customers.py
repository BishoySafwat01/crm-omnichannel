from typing import Optional
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.customer import AdminCustomerListResponse, CustomerStatsResponse
from app.services.customer_service import CustomerService

router = APIRouter()


@router.get("", response_model=AdminCustomerListResponse)
@router.get("/", response_model=AdminCustomerListResponse)
async def list_customers_advanced(
    query: Optional[str] = None,
    brand: Optional[str] = None,
    tier: Optional[str] = None,
    skin_type: Optional[str] = None,
    stage: Optional[str] = None,
    country: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    items, total, total_pages = await CustomerService.search_customers_advanced(
        session=db,
        query=query,
        brand=brand,
        tier=tier,
        skin_type=skin_type,
        stage=stage,
        country=country,
        page=page,
        page_size=page_size,
    )

    return AdminCustomerListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/export")
async def export_customers_csv(
    brand: Optional[str] = None,
    stage: Optional[str] = None,
    tier: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    generator = CustomerService.stream_customers_csv(session=db, brand=brand, stage=stage, tier=tier)
    headers = {
        "Content-Disposition": "attachment; filename=luxira_customers_export.csv",
        "Access-Control-Expose-Headers": "Content-Disposition",
    }
    return StreamingResponse(generator, media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/stats", response_model=CustomerStatsResponse)
async def get_customer_stats(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    stats = await CustomerService.get_customer_stats(session=db)
    return CustomerStatsResponse(**stats)
