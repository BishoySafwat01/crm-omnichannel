import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("app.api.ws")

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info("WebSocket client connected. Total connections: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info("WebSocket client disconnected. Remaining connections: %d", len(self.active_connections))

    async def broadcast(self, message: dict):
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning("Error sending WebSocket message: %s", str(e))
                disconnected.add(connection)
        for conn in disconnected:
            self.active_connections.discard(conn)


manager = ConnectionManager()


@router.websocket("/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")
            # Echo or broadcast client events like TYPING_INDICATOR or MESSAGE_STATUS
            if event_type in ["TYPING_INDICATOR", "MESSAGE_STATUS", "PING"]:
                if event_type == "PING":
                    await websocket.send_json({"type": "PONG"})
                else:
                    await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.warning("WebSocket connection exception: %s", str(exc))
        manager.disconnect(websocket)
