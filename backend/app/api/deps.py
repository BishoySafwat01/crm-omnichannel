import uuid
from typing import Optional, Union, Any
import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.enums import UserRole, ChannelEnum
from app.models.user import User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,
)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(reusable_oauth2),
) -> User:
    auth_header = request.headers.get("Authorization")
    if not token and auth_header:
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(token)
        user_id_str: str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = uuid.UUID(user_id_str)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account.",
        )

    return user


async def get_optional_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(reusable_oauth2),
) -> Optional[User]:
    try:
        return await get_current_user(request=request, db=db, token=token)
    except HTTPException:
        return None


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    role_val = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role_val != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required for this operation.",
        )
    return current_user


def user_has_brand_access(user: User, brand: str) -> bool:
    if not user or not user.is_active:
        return False
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val == UserRole.ADMIN.value:
        return True
    access_list = user.brand_access or []
    if "ALL" in access_list or "الكل" in access_list or brand in access_list or brand.lower() == "all":
        return True
    return False


def require_brand_access(brand: str):
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        if not user_has_brand_access(current_user, brand):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied for brand '{brand}'.",
            )
        return current_user
    return dependency


def user_has_channel_access(user: User, channel: Union[str, ChannelEnum]) -> bool:
    """Check if user has permission to access a channel (e.g. messenger, instagram, whatsapp)."""
    if not user or not user.is_active:
        return False
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val == UserRole.ADMIN.value:
        return True
    access_list = getattr(user, "channel_access", None)
    if access_list is None:
        return True
    norm_list = [str(x).strip().lower() for x in access_list]
    if "all" in norm_list or "الكل" in norm_list:
        return True
    ch_str = (channel.value if hasattr(channel, "value") else str(channel)).strip().lower()
    return ch_str in norm_list


def user_has_conversation_access(user: User, conversation: Any) -> bool:
    """Check if user has permission to access a conversation (BOTH brand AND channel allowed)."""
    if not user or not user.is_active:
        return False
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val == UserRole.ADMIN.value:
        return True
    conv_brand = getattr(conversation, "brand", "LAVVA") or "LAVVA"
    conv_channel = getattr(conversation, "channel", "messenger")
    return user_has_brand_access(user, conv_brand) and user_has_channel_access(user, conv_channel)


def require_conversation_access(conversation: Any, user: User) -> None:
    """Raise HTTP 403 if user lacks access to the conversation's brand or channel."""
    if not user_has_conversation_access(user, conversation):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied for this conversation's brand or channel.",
        )
