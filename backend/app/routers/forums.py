from __future__ import annotations

from datetime import datetime
from math import sqrt
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.exceptions import atlas_error
from app.core.redis import get_redis_client
from app.core.realtime import realtime_manager
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.collaboration import ForumPost, ForumReply, ForumVote
from app.models.user import User


router = APIRouter(tags=["Forums"])
ws_router = APIRouter(tags=["Forums WS"])


class PostPayload(BaseModel):
    course_id: UUID
    title: str = Field(min_length=3)
    content: dict


class ReplyPayload(BaseModel):
    content: dict


class VotePayload(BaseModel):
    value: int = Field(ge=-1, le=1)


def _wilson_score(upvotes: int, downvotes: int) -> float:
    total = upvotes + downvotes
    if total == 0:
        return 0.0
    z = 1.96
    phat = upvotes / total
    numerator = phat + z * z / (2 * total) - z * sqrt((phat * (1 - phat) + z * z / (4 * total)) / total)
    denominator = 1 + z * z / total
    return numerator / denominator


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


async def _post_payload(db: AsyncSession, post: ForumPost) -> dict:
    votes_result = await db.execute(select(ForumVote).where(ForumVote.post_id == post.id))
    votes = votes_result.scalars().all()
    replies_count = (
        await db.execute(select(func.count(ForumReply.id)).where(ForumReply.post_id == post.id))
    ).scalar_one()
    upvotes = sum(1 for vote in votes if vote.value > 0)
    downvotes = sum(1 for vote in votes if vote.value < 0)
    return {
        "id": str(post.id),
        "course_id": str(post.course_id),
        "author_id": str(post.author_id),
        "title": post.title,
        "content": post.content_json,
        "status": post.status,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "reply_count": int(replies_count or 0),
        "score": _wilson_score(upvotes, downvotes),
    }


@router.get("/forums/posts")
async def list_posts(
    course_id: UUID,
    sort: str = Query(default="wilson"),
    filter: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    result = await db.execute(
        select(ForumPost).where(ForumPost.course_id == course_id).order_by(desc(ForumPost.created_at))
    )
    posts = result.scalars().all()
    payload = [await _post_payload(db, post) for post in posts]
    if filter == "unresolved":
        payload = [item for item in payload if item["status"] != "RESOLVED"]
    if sort == "wilson":
        payload.sort(key=lambda item: item["score"], reverse=True)
    return payload


@router.post("/forums/posts", status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: PostPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    post = ForumPost(
        course_id=payload.course_id,
        author_id=current_user.id,
        title=payload.title,
        content_json=payload.content,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return await _post_payload(db, post)


@router.patch("/forums/posts/{post_id}")
async def update_post(
    post_id: UUID,
    payload: PostPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)
    if post.author_id != current_user.id and str(current_user.role) != "ADMIN":
        raise atlas_error("AUTH_008", "You do not have permission to perform this action.", status_code=403)
    post.title = payload.title
    post.content_json = payload.content
    post.updated_at = datetime.utcnow()
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return await _post_payload(db, post)


@router.delete("/forums/posts/{post_id}")
async def delete_post(
    post_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)
    if post.author_id != current_user.id and str(current_user.role) != "ADMIN":
        raise atlas_error("AUTH_008", "You do not have permission to perform this action.", status_code=403)
    await db.delete(post)
    await db.commit()
    return {"success": True}


@router.post("/forums/posts/{post_id}/replies", status_code=status.HTTP_201_CREATED)
async def create_reply(
    post_id: UUID,
    payload: ReplyPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)
    reply = ForumReply(
        post_id=post_id,
        author_id=current_user.id,
        content_json=payload.content,
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return {
        "id": str(reply.id),
        "post_id": str(reply.post_id),
        "author_id": str(reply.author_id),
        "content": reply.content_json,
        "is_pinned": reply.is_pinned,
        "created_at": reply.created_at,
    }


@router.post("/forums/posts/{post_id}/vote")
async def vote_post(
    post_id: UUID,
    payload: VotePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)

    result = await db.execute(
        select(ForumVote).where(ForumVote.post_id == post_id, ForumVote.user_id == current_user.id)
    )
    vote = result.scalar_one_or_none()
    if vote is None:
        vote = ForumVote(post_id=post_id, user_id=current_user.id, value=payload.value)
    else:
        vote.value = payload.value
    db.add(vote)
    await db.commit()
    return await _post_payload(db, post)


@router.patch("/forums/replies/{reply_id}/pin")
async def pin_reply(
    reply_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    reply = await db.get(ForumReply, reply_id)
    if reply is None:
        raise atlas_error("FORUM_002", "Reply not found.", status_code=404)
    post = await db.get(ForumPost, reply.post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)
    if post.author_id != current_user.id and str(current_user.role) not in {"TEACHER", "ADMIN"}:
        raise atlas_error("AUTH_008", "You do not have permission to perform this action.", status_code=403)
    reply.is_pinned = True
    post.status = "RESOLVED"
    db.add(reply)
    db.add(post)
    await db.commit()
    return {"id": str(reply.id), "is_pinned": True}


@ws_router.websocket("/ws/forum/{course_id}")
async def forum_socket(
    websocket: WebSocket,
    course_id: UUID,
    db: AsyncSession = Depends(get_session),
    redis_client=Depends(get_redis_client),
) -> None:
    await _authenticate_socket(websocket, db)
    channel = f"forum:{course_id}"
    await realtime_manager.connect(channel, websocket, redis_client)
    try:
        while True:
            message = await websocket.receive_json()
            await realtime_manager.publish(redis_client, channel, message)
    except WebSocketDisconnect:
        await realtime_manager.disconnect(channel, websocket)
