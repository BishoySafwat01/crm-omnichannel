import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.customer import (
    CustomerDetailResponse,
    CustomerIdentityResponse,
    CustomerResponse,
    CustomerUpdate,
)
from app.schemas.pagination import PaginatedResponse
from app.services.customer_service import CustomerService

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get(
    "",
    response_model=PaginatedResponse[CustomerResponse],
    summary="List Normalized Customers",
)
async def list_customers(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    search: Optional[str] = Query(None, description="Search by name, email, or phone"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve paginated list of normalized CRM customers with optional search filtering."""
    customers, total = await CustomerService.list_customers(
        session=db, page=page, page_size=page_size, search=search
    )
    items = [CustomerResponse.model_validate(c) for c in customers]
    return PaginatedResponse.create(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/{customer_id}",
    response_model=CustomerDetailResponse,
    summary="Get Customer Details",
)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve detailed information for a specific customer, including linked identities."""
    customer = await CustomerService.get_customer_by_id(session=db, customer_id=customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found.",
        )
    return CustomerDetailResponse.model_validate(customer)


@router.get(
    "/{customer_id}/identities",
    response_model=list[CustomerIdentityResponse],
    summary="Get Customer Identities",
)
async def get_customer_identities(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all normalized platform identities for a specific customer."""
    identities = await CustomerService.get_customer_identities(
        session=db, customer_id=customer_id
    )
    if identities is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found.",
        )
    return [CustomerIdentityResponse.model_validate(ident) for ident in identities]


class CustomerTagsRequest(BaseModel if "BaseModel" in globals() else object):
    tags: list[str] = []


@router.post(
    "/{customer_id}/tags",
    summary="Update Customer Classification Tags",
)
async def update_customer_tags(
    customer_id: uuid.UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update customer classification tags and attributes."""
    customer = await CustomerService.get_customer_by_id(session=db, customer_id=customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found.",
        )
    tags = payload.get("tags", [])
    customer.tags = tags
    await db.commit()
    await db.refresh(customer)
    return {"status": "success", "customer_id": str(customer_id), "tags": customer.tags}


@router.patch(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Update Customer Information & Attributes",
)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update customer profile information (name, email, phone, location, tier, skin_type, stage)."""
    customer = await CustomerService.get_customer_by_id(session=db, customer_id=customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        if val is not None:
            setattr(customer, field, val)

    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)
