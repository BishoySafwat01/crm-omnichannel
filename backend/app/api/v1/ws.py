import logging
import uuid as uuid_module
from typing import Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.security import decode_access_token

logger = logging.getLogger("app.api.ws")

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        # Map of user_id -> set of WebSocket connections for that user
        self._connections: dict[str, set[WebSocket]] = {}

    @property
    def active_connections(self) -> set[WebSocket]:
        """Flat set of all active sockets (for legacy broadcast callers)."""
        result: set[WebSocket] = set()
        for sockets in self._connections.values():
            result |= sockets
        return result

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        self._connections.setdefault(user_id, set()).add(websocket)
        logger.info(
            "WebSocket connected: user_id=%s, total_connections=%d",
            user_id,
            sum(len(v) for v in self._connections.values()),
        )

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        sockets = self._connections.get(user_id, set())
        sockets.discard(websocket)
        if not sockets:
            self._connections.pop(user_id, None)
        logger.info(
            "WebSocket disconnected: user_id=%s, total_connections=%d",
            user_id,
            sum(len(v) for v in self._connections.values()),
        )

    async def broadcast(self, message: dict) -> None:
        disconnected: list[tuple[str, WebSocket]] = []
        for user_id, sockets in list(self._connections.items()):
            for ws in list(sockets):
                try:
                    await ws.send_json(message)
                except Exception as e:
                    logger.warning("Error sending WebSocket message to user %s: %s", user_id, e)
                    disconnected.append((user_id, ws))
        for user_id, ws in disconnected:
            sockets = self._connections.get(user_id, set())
            sockets.discard(ws)
            if not sockets:
                self._connections.pop(user_id, None)


manager = ConnectionManager()


async def _authenticate_token(token: Optional[str]) -> Optional[str]:
    """Validate a JWT token and return the user_id string, or None if invalid."""
    if not token:
        return None
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.user import User
        payload = decode_access_token(token)
        user_id_str: str = payload.get("sub", "")
        if not user_id_str:
            return None
        user_uuid = uuid_module.UUID(user_id_str)
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.id == user_uuid))
            user = result.scalar_one_or_none()
            if user and user.is_active:
                return user_id_str
        return None
    except Exception:
        return None


@router.websocket("/chat")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT Bearer token for authentication"),
):
    """Authenticated real-time WebSocket endpoint. Pass token as ?token=<jwt>."""
    # Authenticate before accepting the connection
    user_id = await _authenticate_token(token)
    if not user_id:
        # Reject with 4001 = Unauthorized (application-level close code)
        await websocket.close(code=4001, reason="Authentication required")
        logger.warning("WebSocket connection rejected: missing or invalid token")
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")
            if event_type == "PING":
                await websocket.send_json({"type": "PONG"})
            elif event_type in ["TYPING_INDICATOR", "MESSAGE_STATUS"]:
                await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as exc:
        logger.warning("WebSocket connection exception for user %s: %s", user_id, exc)
        manager.disconnect(websocket, user_id)

