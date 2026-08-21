import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserResponse

logger = logging.getLogger("app.api.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate User & Obtain JWT Bearer Token",
)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user with email and password, returning JWT access token."""
    clean_email = payload.email.strip().lower()
    stmt = select(User).where(User.email.ilike(clean_email))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    # P2-4: Record last login timestamp
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(subject=user.id)
    user_response = UserResponse.model_validate(user)

    logger.info("User logged in successfully: email=%s, id=%s", user.email, user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Invalidate Current Session",
)
async def logout(
    current_user: User = Depends(get_current_user),
):
    """
    P2-3: Client-side logout endpoint.

    The client MUST discard the JWT token upon receiving this response.
    Full server-side token revocation requires a Redis blocklist — track as a
    follow-up when the refresh-token flow is implemented.
    """
    logger.info("User logged out: id=%s, email=%s", current_user.id, current_user.email)
    # 204 No Content — client discards token
    return


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current Authenticated User Profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """Return profile details and brand permissions for current authenticated user."""
    return UserResponse.model_validate(current_user)
