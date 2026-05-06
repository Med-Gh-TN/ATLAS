from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.exceptions import atlas_error
from app.core.redis import get_redis_client
from app.core.realtime import realtime_manager
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.all_models import Notification as NotificationModel
from app.models.user import User
from app.schemas.pagination import PageMeta
from app.services.communications.notification_service import (
    fetch_user_notifications,
    mark_notification_read,
)


router = APIRouter(tags=["Notifications"])
ws_router = APIRouter(tags=["NotificationsWS"])


class NotificationItem(BaseModel):
    id: str
    title: str
    message: str
    is_read: bool
    contribution_id: str | None = None
    created_at: Any


class NotificationListResponse(BaseModel):
    items: list[NotificationItem]
    meta: PageMeta


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> NotificationListResponse:
    rows = await fetch_user_notifications(
        user_id=current_user.id,
        skip=offset,
        limit=limit,
        session=db,
    )
    items = [
        NotificationItem(
            **{
                **row,
                "id": str(row["id"]),
                "contribution_id": str(row["contribution_id"]) if row.get("contribution_id") else None,
            }
        )
        for row in rows
    ]
    total = (
        await db.execute(
            select(func.count())
            .select_from(NotificationModel)
            .where(NotificationModel.user_id == current_user.id)
        )
    ).scalar_one()
    return NotificationListResponse(
        items=items,
        meta=PageMeta(
            total=total,
            limit=limit,
            offset=offset,
            has_more=offset + len(items) < total,
        ),
    )


@router.patch("/notifications/{notification_id}")
async def read_notification(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    try:
        return await mark_notification_read(
            notification_id=notification_id,
            user_id=current_user.id,
            session=db,
        )
    except ValueError as exc:
        raise atlas_error(
            "GEN_002",
            str(exc),
            field="notification_id",
            status_code=404,
        ) from exc


@ws_router.websocket("/ws/notifications/{user_id}")
async def notifications_ws(
    websocket: WebSocket,
    user_id: UUID,
    accessToken: str | None = Query(default=None),
    token: str | None = Query(default=None),
    redis_client=Depends(get_redis_client),
) -> None:
    await websocket.accept()
    raw_token = accessToken or token

    if not raw_token:
        await websocket.close(code=4401)
        return

    payload = security.decode_token(raw_token)
    if not payload or payload.get("sub") != str(user_id):
        await websocket.close(code=4403)
        return

    channel = f"notifications:{user_id}"
    await realtime_manager.connect(channel, websocket, redis_client)
    try:
        while True:
            message = await websocket.receive_json()
            await realtime_manager.publish(redis_client, channel, message)
    except WebSocketDisconnect:
        await realtime_manager.disconnect(channel, websocket)
