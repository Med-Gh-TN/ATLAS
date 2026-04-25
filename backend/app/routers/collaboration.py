from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.cache import invalidate_cache_patterns
from app.core.exceptions import atlas_error
from app.core.redis import get_redis_client
from app.core.realtime import realtime_manager
from app.db.session import get_session
from app.dependencies import get_current_user, require_role
from app.models.collaboration import LearningPathJob, LiveSession, StudyGroup, StudyGroupMember
from app.models.user import User


router = APIRouter(tags=["Collaboration"])
ws_router = APIRouter(tags=["Collaboration WS"])


class LearningPathRequest(BaseModel):
    goal: str
    course_ids: list[str] = []
    available_hours_per_week: int = Field(default=5, ge=1)


class StudyGroupCreateRequest(BaseModel):
    name: str
    description: str | None = None
    course_id: UUID | None = None


class StudyGroupNotesRequest(BaseModel):
    notes: dict


class StudyGroupJoinRequest(BaseModel):
    pass


class LiveSessionCreateRequest(BaseModel):
    course_id: UUID
    title: str


async def _authenticate_socket(websocket: WebSocket, db: AsyncSession) -> User:
    token = websocket.query_params.get("accessToken")
    if not token:
        await websocket.close(code=4401)
        raise atlas_error("AUTH_007", "Authentication credentials are required.", status_code=401)

    payload = security.decode_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=4401)
        raise atlas_error("AUTH_007", "The access token is invalid or has expired.", status_code=401)

    user = await db.get(User, UUID(payload["sub"]))
    if user is None:
        await websocket.close(code=4401)
        raise atlas_error("AUTH_007", "The access token is invalid or has expired.", status_code=401)
    return user


@router.post("/learning-path/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_learning_path(
    payload: LearningPathRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    steps = [
        {
            "id": str(uuid4()),
            "title": f"Review {course_id}",
            "action": "study-course",
            "estimated_hours": max(1, payload.available_hours_per_week // max(1, len(payload.course_ids or ['1']))),
        }
        for course_id in (payload.course_ids or ["general-foundation"])
    ]
    job = LearningPathJob(
        user_id=current_user.id,
        input_json=payload.model_dump(),
        result_json={"goal": payload.goal, "steps": steps},
        status="READY",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {"job_id": str(job.id), "status": job.status}


@router.get("/learning-path/{job_id}")
async def get_learning_path(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    job = await db.get(LearningPathJob, job_id)
    if job is None or job.user_id != current_user.id:
        raise atlas_error("LEARNING_PATH_001", "Learning path not found.", status_code=404)
    return {
        "id": str(job.id),
        "status": job.status,
        "result": job.result_json,
        "created_at": job.created_at,
    }


@router.post("/study-groups", status_code=status.HTTP_201_CREATED)
async def create_study_group(
    payload: StudyGroupCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict:
    group = StudyGroup(
        name=payload.name,
        description=payload.description,
        course_id=payload.course_id,
        owner_id=current_user.id,
    )
    db.add(group)
    await db.flush()
    db.add(StudyGroupMember(group_id=group.id, user_id=current_user.id))
    await db.commit()
    await db.refresh(group)
    await invalidate_cache_patterns(redis_client, "user_profile:*")
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "course_id": str(group.course_id) if group.course_id else None,
        "notes": group.notes_json,
        "created_at": group.created_at,
    }


@router.get("/study-groups")
async def list_study_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    result = await db.execute(select(StudyGroup).order_by(desc(StudyGroup.created_at)))
    groups = result.scalars().all()
    return [
        {
            "id": str(group.id),
            "name": group.name,
            "description": group.description,
            "course_id": str(group.course_id) if group.course_id else None,
            "created_at": group.created_at,
        }
        for group in groups
    ]


@router.get("/study-groups/{group_id}")
async def get_study_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    group = await db.get(StudyGroup, group_id)
    if group is None:
        raise atlas_error("STUDY_GROUP_001", "Study group not found.", status_code=404)
    members_result = await db.execute(select(StudyGroupMember).where(StudyGroupMember.group_id == group_id))
    members = members_result.scalars().all()
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "course_id": str(group.course_id) if group.course_id else None,
        "notes": group.notes_json,
        "members": [{"user_id": str(member.user_id), "joined_at": member.joined_at} for member in members],
    }


@router.post("/study-groups/{group_id}/join")
async def join_study_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict:
    group = await db.get(StudyGroup, group_id)
    if group is None:
        raise atlas_error("STUDY_GROUP_001", "Study group not found.", status_code=404)
    existing = await db.execute(
        select(StudyGroupMember).where(StudyGroupMember.group_id == group_id, StudyGroupMember.user_id == current_user.id)
    )
    member = existing.scalar_one_or_none()
    if member is None:
        member = StudyGroupMember(group_id=group_id, user_id=current_user.id)
        db.add(member)
        await db.commit()
        await db.refresh(member)
        await invalidate_cache_patterns(redis_client, "user_profile:*")
    return {"group_id": str(group_id), "user_id": str(current_user.id), "joined_at": member.joined_at}


@router.patch("/study-groups/{group_id}/notes")
async def update_study_group_notes(
    group_id: UUID,
    payload: StudyGroupNotesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict:
    member_result = await db.execute(
        select(StudyGroupMember).where(StudyGroupMember.group_id == group_id, StudyGroupMember.user_id == current_user.id)
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        raise atlas_error("STUDY_GROUP_002", "You must join the group before editing notes.", status_code=403)
    group = await db.get(StudyGroup, group_id)
    if group is None:
        raise atlas_error("STUDY_GROUP_001", "Study group not found.", status_code=404)
    group.notes_json = payload.notes
    group.updated_at = datetime.utcnow()
    db.add(group)
    await db.commit()
    await invalidate_cache_patterns(redis_client, "user_profile:*")
    return {"id": str(group.id), "notes": group.notes_json, "updated_at": group.updated_at}


@router.post("/live-sessions", status_code=status.HTTP_201_CREATED)
async def create_live_session(
    payload: LiveSessionCreateRequest,
    current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict:
    session_row = LiveSession(
        teacher_id=current_user.id,
        course_id=payload.course_id,
        title=payload.title,
    )
    db.add(session_row)
    await db.commit()
    await db.refresh(session_row)
    await invalidate_cache_patterns(redis_client, "admin_dashboard:*")
    return {
        "id": str(session_row.id),
        "course_id": str(session_row.course_id),
        "title": session_row.title,
        "current_page": session_row.current_page,
        "is_active": session_row.is_active,
        "created_at": session_row.created_at,
    }


@router.get("/live-sessions/{session_id}")
async def get_live_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    session_row = await db.get(LiveSession, session_id)
    if session_row is None:
        raise atlas_error("LIVE_SESSION_001", "Live session not found.", status_code=404)
    return {
        "id": str(session_row.id),
        "course_id": str(session_row.course_id),
        "title": session_row.title,
        "current_page": session_row.current_page,
        "is_active": session_row.is_active,
        "created_at": session_row.created_at,
        "ended_at": session_row.ended_at,
    }


@router.delete("/live-sessions/{session_id}")
async def end_live_session(
    session_id: UUID,
    current_user: User = Depends(require_role("TEACHER", "ADMIN")),
    db: AsyncSession = Depends(get_session),
    redis_client: Redis = Depends(get_redis_client),
) -> dict[str, bool]:
    session_row = await db.get(LiveSession, session_id)
    if session_row is None:
        raise atlas_error("LIVE_SESSION_001", "Live session not found.", status_code=404)
    if session_row.teacher_id != current_user.id and str(current_user.role) != "ADMIN":
        raise atlas_error("AUTH_008", "You do not have permission to perform this action.", status_code=403)
    session_row.is_active = False
    session_row.ended_at = datetime.utcnow()
    db.add(session_row)
    await db.commit()
    await invalidate_cache_patterns(redis_client, "admin_dashboard:*")
    return {"success": True}


@ws_router.websocket("/ws/study-groups/{group_id}")
async def study_group_socket(
    websocket: WebSocket,
    group_id: UUID,
    db: AsyncSession = Depends(get_session),
    redis_client=Depends(get_redis_client),
) -> None:
    user = await _authenticate_socket(websocket, db)
    member_result = await db.execute(
        select(StudyGroupMember).where(StudyGroupMember.group_id == group_id, StudyGroupMember.user_id == user.id)
    )
    if member_result.scalar_one_or_none() is None:
        await websocket.close(code=4403)
        return
    channel = f"study-group:{group_id}"
    await realtime_manager.connect(channel, websocket, redis_client)
    try:
        while True:
            message = await websocket.receive_json()
            await realtime_manager.publish(redis_client, channel, message)
    except WebSocketDisconnect:
        await realtime_manager.disconnect(channel, websocket)


@ws_router.websocket("/ws/live-sessions/{session_id}")
async def live_session_socket(
    websocket: WebSocket,
    session_id: UUID,
    db: AsyncSession = Depends(get_session),
    redis_client=Depends(get_redis_client),
) -> None:
    await _authenticate_socket(websocket, db)
    channel = f"live-session:{session_id}"
    await realtime_manager.connect(channel, websocket, redis_client)
    try:
        while True:
            message = await websocket.receive_json()
            await realtime_manager.publish(redis_client, channel, message)
    except WebSocketDisconnect:
        await realtime_manager.disconnect(channel, websocket)
