import asyncio
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
        # Reverse mapping: WebSocket -> user_id for O(1) disconnection cleanup
        self._socket_to_user: dict[WebSocket, str] = {}
        # Map of conversation_id -> set of subscribed WebSocket connections
        self._conversation_subscribers: dict[str, set[WebSocket]] = {}
        # Reverse mapping: WebSocket -> set of conversation_ids for room cleanup
        self._socket_to_conversations: dict[WebSocket, set[str]] = {}

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
        self._socket_to_user[websocket] = user_id
        self._socket_to_conversations[websocket] = set()
        logger.info(
            "WebSocket connected: user_id=%s, total_connections=%d",
            user_id,
            sum(len(v) for v in self._connections.values()),
        )

    def disconnect(self, websocket: WebSocket, user_id: Optional[str] = None) -> None:
        resolved_user_id = user_id or self._socket_to_user.get(websocket)
        if resolved_user_id:
            sockets = self._connections.get(resolved_user_id, set())
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(resolved_user_id, None)

        self._socket_to_user.pop(websocket, None)

        # Clean up conversation room subscriptions
        subscribed_rooms = self._socket_to_conversations.pop(websocket, set())
        for conv_id in subscribed_rooms:
            room_sockets = self._conversation_subscribers.get(conv_id)
            if room_sockets:
                room_sockets.discard(websocket)
                if not room_sockets:
                    self._conversation_subscribers.pop(conv_id, None)

        logger.info(
            "WebSocket disconnected: user_id=%s, total_connections=%d",
            resolved_user_id,
            sum(len(v) for v in self._connections.values()),
        )

    def subscribe_conversation(self, websocket: WebSocket, conversation_id: str) -> None:
        """Subscribe a specific client socket to a conversation room."""
        conv_key = str(conversation_id)
        self._conversation_subscribers.setdefault(conv_key, set()).add(websocket)
        self._socket_to_conversations.setdefault(websocket, set()).add(conv_key)

    def unsubscribe_conversation(self, websocket: WebSocket, conversation_id: str) -> None:
        """Unsubscribe a client socket from a conversation room."""
        conv_key = str(conversation_id)
        room_sockets = self._conversation_subscribers.get(conv_key)
        if room_sockets:
            room_sockets.discard(websocket)
            if not room_sockets:
                self._conversation_subscribers.pop(conv_key, None)

        socket_rooms = self._socket_to_conversations.get(websocket)
        if socket_rooms:
            socket_rooms.discard(conv_key)

    @staticmethod
    async def _send_safe(ws: WebSocket, message: dict) -> bool:
        """Send JSON message to a single WebSocket client safely, catching disconnects."""
        try:
            await ws.send_json(message)
            return True
        except Exception as exc:
            logger.debug("Failed to deliver WebSocket message to socket: %s", exc)
            return False

    def _cleanup_dead_sockets(self, dead_sockets: set[WebSocket]) -> None:
        """Purge unresponsive or broken sockets from all tracking structures."""
        for ws in dead_sockets:
            self.disconnect(ws)

    async def _dispatch_to_sockets(self, sockets: set[WebSocket], message: dict) -> None:
        """Fan out a message concurrently across a target set of sockets via asyncio.gather."""
        if not sockets:
            return

        target_list = list(sockets)
        results = await asyncio.gather(
            *(self._send_safe(ws, message) for ws in target_list),
            return_exceptions=True,
        )

        dead_sockets = {
            ws for ws, success in zip(target_list, results)
            if success is not True
        }
        if dead_sockets:
            self._cleanup_dead_sockets(dead_sockets)

    async def broadcast(self, message: dict) -> None:
        """Globally broadcast a message to all connected clients concurrently."""
        target_sockets = self.active_connections
        await self._dispatch_to_sockets(target_sockets, message)

    async def broadcast_to_conversation(self, conversation_id: str, message: dict) -> None:
        """Broadcast a message exclusively to sockets subscribed to a specific conversation."""
        target_sockets = self._conversation_subscribers.get(str(conversation_id), set())
        await self._dispatch_to_sockets(target_sockets, message)

    async def send_to_user(self, user_id: str, message: dict) -> None:
        """Deliver a message to all active sockets belonging to a specific user/agent."""
        target_sockets = self._connections.get(str(user_id), set())
        await self._dispatch_to_sockets(target_sockets, message)


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
            elif event_type == "JOIN_CONVERSATION":
                conv_id = data.get("conversation_id")
                if conv_id:
                    manager.subscribe_conversation(websocket, str(conv_id))
                    logger.debug("User %s subscribed to conversation %s", user_id, conv_id)
            elif event_type == "LEAVE_CONVERSATION":
                conv_id = data.get("conversation_id")
                if conv_id:
                    manager.unsubscribe_conversation(websocket, str(conv_id))
                    logger.debug("User %s unsubscribed from conversation %s", user_id, conv_id)
            elif event_type in ["TYPING_INDICATOR", "MESSAGE_STATUS"]:
                await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as exc:
        logger.warning("WebSocket connection exception for user %s: %s", user_id, exc)
        manager.disconnect(websocket, user_id)


REDIS_REALTIME_CHANNEL = "crm:realtime:events"


async def publish_realtime_event(
    target: str,
    payload: dict,
    conversation_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> bool:
    """
    Publish a real-time event to the shared Redis Pub/Sub channel.
    All active Uvicorn worker processes will receive this and dispatch
    the event to their locally connected WebSocket clients.
    """
    try:
        import json
        from app.core.redis import get_redis_client

        client = await get_redis_client()
        envelope = {
            "target": target,
            "payload": payload,
            "conversation_id": str(conversation_id) if conversation_id else None,
            "user_id": str(user_id) if user_id else None,
        }
        await client.publish(REDIS_REALTIME_CHANNEL, json.dumps(envelope))
        return True
    except Exception as exc:
        logger.warning("Failed to publish real-time event to Redis (%s): %s", target, exc)
        return False


async def start_redis_listener() -> None:
    """
    Continuous background listener task that subscribes to REDIS_REALTIME_CHANNEL
    and dispatches incoming cross-worker events via ConnectionManager.
    """
    import json
    from app.core.redis import get_redis_client

    logger.info("[WebSocket] Starting Redis Pub/Sub listener on channel '%s'...", REDIS_REALTIME_CHANNEL)
    while True:
        pubsub = None
        try:
            client = await get_redis_client()
            pubsub = client.pubsub()
            await pubsub.subscribe(REDIS_REALTIME_CHANNEL)
            logger.info("[WebSocket] Subscribed to Redis channel '%s'", REDIS_REALTIME_CHANNEL)

            async for raw_msg in pubsub.listen():
                if raw_msg.get("type") != "message":
                    continue
                data_str = raw_msg.get("data")
                if not data_str:
                    continue
                try:
                    envelope = json.loads(data_str) if isinstance(data_str, str) else data_str
                    target = envelope.get("target", "global")
                    payload = envelope.get("payload") or {}
                    conv_id = envelope.get("conversation_id")
                    uid = envelope.get("user_id")

                    if target == "global":
                        await manager._dispatch_to_sockets(manager.active_connections, payload)
                    elif target == "conversation" and conv_id:
                        await manager.broadcast_to_conversation(conv_id, payload)
                    elif target == "user" and uid:
                        await manager.send_to_user(uid, payload)
                    else:
                        await manager._dispatch_to_sockets(manager.active_connections, payload)
                except Exception as parse_err:
                    logger.warning("[WebSocket] Error processing Redis Pub/Sub event: %s", parse_err)

        except asyncio.CancelledError:
            logger.info("[WebSocket] Redis Pub/Sub listener received shutdown signal.")
            if pubsub:
                try:
                    await pubsub.unsubscribe(REDIS_REALTIME_CHANNEL)
                    if hasattr(pubsub, "aclose"):
                        await pubsub.aclose()
                    else:
                        await pubsub.close()
                except Exception:
                    pass
            break
        except Exception as exc:
            logger.error("[WebSocket] Redis Pub/Sub listener error: %s. Retrying in 5s...", exc)
            if pubsub:
                try:
                    if hasattr(pubsub, "aclose"):
                        await pubsub.aclose()
                    else:
                        await pubsub.close()
                except Exception:
                    pass
            await asyncio.sleep(5)


