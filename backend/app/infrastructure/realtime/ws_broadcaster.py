import logging
from typing import Any, Dict, Optional

from app.domain.ports.broadcaster import RealtimeBroadcasterPort

logger = logging.getLogger("app.infrastructure.realtime.ws_broadcaster")


class WebSocketBroadcaster(RealtimeBroadcasterPort):
    """Infrastructure Adapter implementing RealtimeBroadcasterPort.
    Bridges domain and application events to the WebSocket and Redis Pub/Sub subsystem.
    """

    async def broadcast(self, event: Dict[str, Any]) -> None:
        await self.broadcast_event(target="global", payload=event)

    async def broadcast_to_conversation(
        self, conversation_id: str, event: Dict[str, Any]
    ) -> None:
        await self.broadcast_event(
            target="conversation", payload=event, conversation_id=str(conversation_id)
        )

    async def broadcast_to_user(
        self, user_id: str, event: Dict[str, Any]
    ) -> None:
        await self.broadcast_event(
            target="user", payload=event, user_id=str(user_id)
        )

    async def broadcast_event(
        self,
        target: str,
        payload: Dict[str, Any],
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> None:
        try:
            from app.api.v1.ws import broadcast_realtime_event
            await broadcast_realtime_event(
                target=target,
                payload=payload,
                conversation_id=conversation_id,
                user_id=user_id,
            )
        except Exception as exc:
            logger.debug("[WebSocketBroadcaster] Error broadcasting event: %s", exc)


# Global default singleton instance
ws_broadcaster: RealtimeBroadcasterPort = WebSocketBroadcaster()
