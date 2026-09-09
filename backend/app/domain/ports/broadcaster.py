from typing import Any, Dict, Optional, Protocol


class RealtimeBroadcasterPort(Protocol):
    """Domain Port for broadcasting real-time event notifications.
    Decouples application services from outer transport implementations (WebSockets, SSE, etc.).
    """

    async def broadcast(self, event: Dict[str, Any]) -> None:
        """Broadcast event to all connected global clients."""
        ...

    async def broadcast_to_conversation(
        self, conversation_id: str, event: Dict[str, Any]
    ) -> None:
        """Broadcast event to subscribers of a specific conversation room."""
        ...

    async def broadcast_to_user(
        self, user_id: str, event: Dict[str, Any]
    ) -> None:
        """Broadcast event to a specific authenticated user."""
        ...

    async def broadcast_event(
        self,
        target: str,
        payload: Dict[str, Any],
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> None:
        """Generic real-time broadcast dispatcher."""
        ...
