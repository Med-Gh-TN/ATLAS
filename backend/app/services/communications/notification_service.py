import uuid
import logging
from typing import List, Dict, Any
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from app.models.all_models import Notification

logger = logging.getLogger(__name__)

# ==========================================
# WEBSOCKET CONNECTION MANAGEMENT
# ==========================================

class ConnectionManager:
    """
    US-11: WebSocket Connection Manager for Real-Time In-App Notifications.
    Tracks active user connections to dispatch targeted state changes.
    Defensive Architecture: Decoupled from HTTP routing to prevent circular imports.
    """
    def __init__(self):
        # Map user_id to a list of active WebSocket connections.
        # This supports multi-device sessions (e.g., user logged in on Web and Mobile simultaneously).
        self.active_connections: Dict[uuid.UUID, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID):
        """Accepts a new WS connection and registers it to the user's active session pool."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"[WS MANAGER] Connected user: {user_id} | Active sessions: {len(self.active_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: uuid.UUID):
        """Removes a disconnected WS from the session pool and cleans up memory."""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            # If no sessions remain, purge the user key entirely
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"[WS MANAGER] Disconnected user: {user_id}")

    async def send_personal_message(self, message: dict, user_id: uuid.UUID):
        """
        Dispatches a JSON payload to ALL active WebSocket connections for a specific user.
        Safely handles and purges dead or unresponsive connections during iteration.
        """
        if user_id in self.active_connections:
            # Create a shallow copy of the list to iterate safely.
            # If a connection fails and is removed, it won't crash the iterator.
            for connection in list(self.active_connections[user_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"[WS MANAGER] Delivery failed to {user_id}. Purging connection: {e}")
                    self.disconnect(connection, user_id)

# ---------------------------------------------------------------------------
# SINGLETON INSTANCE:
# All modules must import `ws_manager` from here to push real-time events.
# ---------------------------------------------------------------------------
ws_manager = ConnectionManager()


# ==========================================
# NOTIFICATION STATE PERSISTENCE (CRUD)
# ==========================================

async def fetch_user_notifications(
    user_id: uuid.UUID,
    skip: int,
    limit: int,
    session: AsyncSession
) -> List[Dict[str, Any]]:
    """
    US-11: Retrieve historical notifications for the authenticated user.
    Executes paginated queries ordered by most recent first.
    """
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(desc(Notification.created_at))
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(stmt)
    notifications = result.scalars().all()

    # Map to expected dictionary format for the HTTP endpoint contract
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "is_read": n.is_read,
            "contribution_id": n.contribution_id,
            "created_at": n.created_at
        }
        for n in notifications
    ]

async def mark_notification_read(
    notification_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSession
) -> Dict[str, Any]:
    """
    US-11: Update a specific notification state.
    Includes explicit ownership validation to prevent IDOR (Insecure Direct Object Reference).
    """
    result = await session.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id
        )
    )
    notification = result.scalars().first()

    if not notification:
        # Throw domain-level error; the API endpoint will catch and translate to HTTP 404
        raise ValueError(f"Notification {notification_id} not found or access denied.")

    notification.is_read = True
    await session.commit()

    return {"status": "success", "is_read": True}