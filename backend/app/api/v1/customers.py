import logging
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_current_user
from app.core.database import get_db
from app.models.customer import Customer
from app.models.user import User
from app.schemas.customer import (
    CustomerDetailResponse,
    CustomerIdentityResponse,
    CustomerResponse,
    CustomerUpdate,
)
from app.schemas.pagination import PaginatedResponse
from app.services.customer_service import CustomerService

logger = logging.getLogger(__name__)

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
    "/locations",
    summary="Get Distinct Customer Countries / Locations",
)
async def get_customer_locations(
    db: AsyncSession = Depends(get_db),
):
    stmt_c = (
        select(distinct(Customer.country))
        .where(
            Customer.country.isnot(None),
            Customer.country != "",
        )
    )
    stmt_l = (
        select(distinct(Customer.location))
        .where(
            Customer.location.isnot(None),
            Customer.location != "",
        )
    )
    res_c = await db.execute(stmt_c)
    res_l = await db.execute(stmt_l)
    loc_set = set(res_c.scalars().all()) | set(res_l.scalars().all())
    locations = sorted([loc for loc in loc_set if loc])
    return {"locations": locations}


@router.get(
    "/{customer_id}",
    response_model=CustomerDetailResponse,
    summary="Get Customer Details",
)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve detailed information for a specific customer, including linked identities and CRM activity."""
    customer_data = await CustomerService.get_customer_detail_by_id(session=db, customer_id=customer_id)
    if not customer_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found.",
        )
    return CustomerDetailResponse(**customer_data)


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


@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Update Customer Information & Attributes",
)
@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Update Customer Information & Attributes",
)
@router.patch(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Update Customer Information & Attributes",
)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Update customer profile information (name, email, phone, location, tier, skin_type, stage)."""
    customer = await CustomerService.get_customer_by_id(session=db, customer_id=customer_id)
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    changes = {}
    for field, val in update_data.items():
        if val is not None:
            old_val = getattr(customer, field, None)
            if old_val != val:
                changes[field] = {"old": old_val, "new": val}
                setattr(customer, field, val)

    # Harmonize location and country auto-mapping
    if payload.country is not None:
        customer.country = payload.country
    if payload.location is not None:
        customer.location = payload.location
        if not customer.country or payload.country is None:
            customer.country = payload.location

    await db.commit()
    await db.refresh(customer)

    # If changes occurred, log audit & timeline
    if changes:
        user_id = current_user.id if current_user else None
        user_name = current_user.full_name if current_user else "النظام"
        client_ip = request.client.host if request and request.client else None

        # 1. Immutable UserAuditLog
        try:
            from app.services.audit_service import AuditService
            action_name = "customer.updated"
            if len(changes) == 1:
                if "stage" in changes:
                    action_name = "customer.stage_changed"
                elif "tier" in changes:
                    action_name = "customer.tier_changed"

            await AuditService.log_action(
                session=db,
                user_id=user_id,
                action=action_name,
                resource_type="customer",
                resource_id=str(customer_id),
                payload={
                    "changes": changes,
                    "user_name": user_name,
                    "customer_name": customer.display_name,
                },
                ip_address=client_ip,
            )
        except Exception as audit_err:
            logger.warning("[Customer Update Audit Log Error] %s", audit_err)

        # 2. Customer 360 Timeline event
        try:
            from app.services.customer_timeline_service import CustomerTimelineService
            summary_parts = []
            if "stage" in changes:
                summary_parts.append(f"تغيير الحالة إلى '{changes['stage']['new']}'")
            if "tier" in changes:
                summary_parts.append(f"تغيير الدرجة إلى '{changes['tier']['new']}'")
            if "location" in changes or "country" in changes:
                new_loc = changes.get("location", {}).get("new") or changes.get("country", {}).get("new")
                summary_parts.append(f"تغيير الموقع إلى '{new_loc}'")
            if "skin_type" in changes:
                summary_parts.append(f"تغيير نوع البشرة إلى '{changes['skin_type']['new']}'")
            if not summary_parts:
                summary_parts.append("تحديث بيانات العميل")

            summary_str = f"قام {user_name} بـ " + " و ".join(summary_parts)
            await CustomerTimelineService.record_event(
                session=db,
                customer_id=customer_id,
                event_type="customer.updated",
                channel="system",
                summary=summary_str,
                details={"modified_by": user_name, "changes": changes},
            )
            await db.commit()
        except Exception:
            pass

    return CustomerResponse.model_validate(customer)


@router.get(
    "/{customer_id}/timeline",
    summary="Get Customer 360 Timeline Feed",
)
async def get_customer_timeline(
    customer_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve paginated Customer 360 timeline events ordered by created_at DESC."""
    from app.services.customer_timeline_service import CustomerTimelineService
    return await CustomerTimelineService.get_customer_timeline(
        session=db, customer_id=customer_id, page=page, page_size=page_size
    )


@router.get(
    "/{customer_id}/notes",
    summary="Get Customer Internal Notes",
)
async def get_customer_notes(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all internal notes for a customer."""
    from app.services.customer_timeline_service import CustomerTimelineService
    return await CustomerTimelineService.get_customer_notes(session=db, customer_id=customer_id)


@router.post(
    "/{customer_id}/notes",
    summary="Add Customer Internal Note",
)
async def add_customer_note(
    customer_id: uuid.UUID,
    payload: dict,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Add an internal agent note for a customer."""
    text = payload.get("text", "")
    if not text or not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note text is required."
        )

    user_id = None
    if request:
        auth_header = request.headers.get("Authorization")
        if auth_header:
            try:
                from app.api.deps import get_current_user
                user = await get_current_user(request=request, db=db)
                user_id = user.id
            except Exception:
                pass

    from app.services.customer_timeline_service import CustomerTimelineService
    note = await CustomerTimelineService.add_note(
        session=db, customer_id=customer_id, author_user_id=user_id, text=text
    )

    # Record UserAuditLog
    try:
        from app.services.audit_service import AuditService
        client_ip = request.client.host if request and request.client else None
        await AuditService.log_action(
            session=db,
            user_id=user_id,
            action="customer.note_created",
            resource_type="customer",
            resource_id=str(customer_id),
            payload={"note_id": str(note.id), "customer_id": str(customer_id)},
            ip_address=client_ip,
        )
    except Exception:
        pass

    return {
        "status": "success",
        "id": str(note.id),
        "customer_id": str(customer_id),
        "text": note.text,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.delete(
    "/{customer_id}/notes/{note_id}",
    summary="Delete Customer Internal Note",
)
async def delete_customer_note(
    customer_id: uuid.UUID,
    note_id: uuid.UUID,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Delete an internal note."""
    user = None
    if request:
        auth_header = request.headers.get("Authorization")
        if auth_header:
            try:
                from app.api.deps import get_current_user
                user = await get_current_user(request=request, db=db)
            except Exception:
                pass

    from app.services.customer_timeline_service import CustomerTimelineService
    try:
        deleted = await CustomerTimelineService.delete_note(
            session=db, customer_id=customer_id, note_id=note_id, requesting_user=user
        )
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found."
            )

        # Record UserAuditLog
        try:
            from app.services.audit_service import AuditService
            client_ip = request.client.host if request and request.client else None
            await AuditService.log_action(
                session=db,
                user_id=user.id if user else None,
                action="customer.note_deleted",
                resource_type="customer",
                resource_id=str(customer_id),
                payload={"note_id": str(note_id), "customer_id": str(customer_id)},
                ip_address=client_ip,
            )
        except Exception:
            pass

        return {"status": "success", "deleted_note_id": str(note_id)}
    except PermissionError as pe:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(pe)
        )
