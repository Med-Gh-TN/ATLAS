import uuid
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.all_models import User
from app.api.v1.endpoints.auth import get_current_user

# DEFENSIVE ARCHITECTURE: All stateful WS management and DB operations are delegated.
# You must implement these functions and the ws_manager singleton in the communications service layer.
try:
    from app.services.communications.notification_service import (
        fetch_user_notifications,
        mark_notification_read,
        ws_manager
    )
except ImportError:
    # Fallback/stub for development until the service layer is fully implemented
    async def fetch_user_notifications(*args, **kwargs): return []
    async def mark_notification_read(*args, **kwargs): return {"status": "fallback"}
    class DummyWSManager:
        async def connect(self, ws, uid): await ws.accept()
        def disconnect(self, ws, uid): pass
    ws_manager = DummyWSManager()

router = APIRouter()
logger = logging.getLogger(__name__)

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
    Endpoint delegates execution to prevent business logic leakage in the routing layer.
    """
    logger.debug(f"Notification fetch initiated | User: {current_user.id} | Offset: {skip}")

    try:
        return await fetch_user_notifications(
            user_id=current_user.id,
            skip=skip,
            limit=limit,
            session=session
        )
    except Exception as e:
        logger.error(f"Failed to fetch notifications for {current_user.id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve notifications at this time."
        )

@router.patch("/{notification_id}/read")
async def mark_notification_as_read_endpoint(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """
    US-11: Mark a specific notification as read.
    """
    logger.info(f"Marking notification read | User: {current_user.id} | Target: {notification_id}")

    try:
        return await mark_notification_read(
            notification_id=notification_id,
            user_id=current_user.id,
            session=session
        )
    except ValueError as ve:
        # Domain layer raises ValueError if the notification doesn't exist or doesn't belong to the user
        logger.warning(f"Notification read violation | User: {current_user.id} | Target: {notification_id} | Reason: {str(ve)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Failed to mark notification {notification_id} as read: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update notification status."
        )

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
    The connection lifecycle is managed by a centralized singleton in the service layer
    to prevent cross-module circular imports.
    """
    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection alive and listen for client heartbeats
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
        logger.info(f"WebSocket cleanly disconnected for user: {user_id}")

    except Exception as e:
        ws_manager.disconnect(websocket, user_id)
        logger.error(f"Unexpected WebSocket failure for user {user_id}: {str(e)}", exc_info=True)