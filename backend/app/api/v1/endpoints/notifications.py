import uuid
import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc

from app.db.session import get_session
from app.models.all_models import Notification, User
from app.api.v1.endpoints.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    US-11: WebSocket Connection Manager for Real-Time In-App Notifications.
    Tracks active user connections to dispatch targeted state changes.
    """
    def __init__(self):
        # Map user_id to a list of active WebSocket connections
        self.active_connections: Dict[uuid.UUID, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"WebSocket connected for user: {user_id}")

    def disconnect(self, websocket: WebSocket, user_id: uuid.UUID):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WebSocket disconnected for user: {user_id}")

    async def send_personal_message(self, message: dict, user_id: uuid.UUID):
        """
        Dispatches a JSON payload to all active WebSocket connections for a specific user.
        Safely handles and purges dead connections.
        """
        if user_id in self.active_connections:
            # Create a shallow copy of the list to iterate safely during potential disconnects
            for connection in list(self.active_connections[user_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to send WS message to {user_id}: {e}")
                    self.disconnect(connection, user_id)

# Global connection manager instance to be imported by moderation/upload services
manager = ConnectionManager()

# ==========================================
# REST Endpoints for Notifications
# ==========================================
@router.get("", response_model=List[dict])
async def get_notifications(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-11: Retrieve historical notifications for the authenticated user.
    Ordered by most recent first.
    """
    stmt = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .offset(skip)
        .limit(limit)
    )
    result = await session.execute(stmt)
    notifications = result.scalars().all()
    
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

@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-11: Mark a specific notification as read.
    """
    result = await session.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalars().first()
    
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
        
    notification.is_read = True
    await session.commit()
    
    return {"status": "success", "is_read": True}

# ==========================================
# WebSocket Endpoint
# ==========================================
@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: uuid.UUID
):
    """
    US-11: Real-time notification delivery via WebSocket.
    """
    await manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection alive and listen for client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)