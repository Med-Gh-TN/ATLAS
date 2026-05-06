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
    parent_reply_id: str | None = None  # For nested/threaded replies


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
    await websocket.accept()
    token = websocket.query_params.get("accessToken") or websocket.query_params.get("token")
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

    # Fetch author info
    author = await db.get(User, post.author_id)
    author_info = {
        "id": str(post.author_id),
        "full_name": author.full_name if author else "Unknown",
        "role": str(author.role) if author else "STUDENT",
        "is_verified": author.is_verified if author else False,
    }

    return {
        "id": str(post.id),
        "course_id": str(post.course_id),
        "author": author_info,
        "title": post.title,
        "content": post.content_json,
        "status": post.status,
        "is_locked": getattr(post, "is_locked", False),
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "reply_count": int(replies_count or 0),
        "score": _wilson_score(upvotes, downvotes),
    }


async def _reply_payload(db: AsyncSession, reply: ForumReply) -> dict:
    """Serialize a reply with enriched author info and threading support."""
    # Fetch author info
    author = await db.get(User, reply.author_id)
    author_info = {
        "id": str(reply.author_id),
        "full_name": author.full_name if author else "Unknown",
        "role": str(author.role) if author else "STUDENT",
        "is_verified": author.is_verified if author else False,
    }

    # Count child replies (for threading)
    child_count = (
        await db.execute(
            select(func.count(ForumReply.id)).where(ForumReply.parent_reply_id == reply.id)
        )
    ).scalar_one()

    return {
        "id": str(reply.id),
        "post_id": str(reply.post_id),
        "author": author_info,
        "content": reply.content_json,
        "parent_reply_id": str(reply.parent_reply_id) if reply.parent_reply_id else None,
        "child_reply_count": int(child_count or 0),
        "is_pinned": reply.is_pinned,
        "is_deleted": getattr(reply, "is_deleted", False),
        "created_at": reply.created_at,
        "updated_at": reply.updated_at,
    }


@router.get("/forums/posts")
async def list_posts(
    course_id: UUID,
    sort: str = Query(default="wilson"),
    filter: str | None = Query(default=None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
) -> dict:
    result = await db.execute(
        select(ForumPost).where(ForumPost.course_id == course_id).order_by(desc(ForumPost.created_at))
    )
    posts = result.scalars().all()
    payload = [await _post_payload(db, post) for post in posts]
    if filter == "unresolved":
        payload = [item for item in payload if item["status"] != "RESOLVED"]
    if sort == "wilson":
        payload.sort(key=lambda item: item["score"], reverse=True)
    elif sort == "recent":
        payload.sort(key=lambda item: item["created_at"], reverse=True)

    total = len(payload)
    items = payload[offset : offset + limit]
    return {
        "items": items,
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(items) < total,
        },
    }


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


@router.get("/forums/posts/{post_id}")
async def get_post(
    post_id: UUID,
    db: AsyncSession = Depends(get_session),
) -> dict:
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)
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

    # Check if post is locked
    if getattr(post, "is_locked", False):
        raise atlas_error("FORUM_003", "This post is locked and cannot receive new replies.", status_code=403)

    # Validate parent reply if provided
    parent_reply_id = None
    if payload.parent_reply_id:
        parent_reply = await db.get(ForumReply, UUID(payload.parent_reply_id))
        if parent_reply is None or parent_reply.post_id != post_id:
            raise atlas_error("FORUM_002", "Parent reply not found in this post.", status_code=404)
        parent_reply_id = parent_reply.id

    reply = ForumReply(
        post_id=post_id,
        author_id=current_user.id,
        content_json=payload.content,
        parent_reply_id=parent_reply_id,
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return await _reply_payload(db, reply)


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


@router.get("/forums/posts/{post_id}/replies")
async def list_replies(
    post_id: UUID,
    threaded: bool = Query(default=True, description="Return threaded/nested structure"),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """List all replies for a post with optional threading support."""
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)

    result = await db.execute(
        select(ForumReply)
        .where(ForumReply.post_id == post_id)
        .order_by(ForumReply.is_pinned.desc(), ForumReply.created_at.asc())
    )
    all_replies = result.scalars().all()

    if threaded:
        reply_map = {}
        root_replies = []

        for reply in all_replies:
            payload = await _reply_payload(db, reply)
            payload["children"] = []
            reply_map[reply.id] = payload

        for reply in all_replies:
            payload = reply_map[reply.id]
            if reply.parent_reply_id and reply.parent_reply_id in reply_map:
                reply_map[reply.parent_reply_id]["children"].append(payload)
            else:
                root_replies.append(payload)

        return {"items": root_replies, "threaded": True, "total_count": len(all_replies)}
    else:
        items = [await _reply_payload(db, reply) for reply in all_replies]
        return {"items": items, "threaded": False, "total_count": len(items)}


@router.patch("/forums/posts/{post_id}/lock")
async def lock_post(
    post_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Lock a post to prevent new replies (moderation tool)."""
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)
    if post.author_id != current_user.id and str(current_user.role) not in {"TEACHER", "ADMIN"}:
        raise atlas_error("AUTH_008", "You do not have permission to lock this post.", status_code=403)

    post.is_locked = True
    post.updated_at = datetime.utcnow()
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": str(post.id), "is_locked": True}


@router.patch("/forums/posts/{post_id}/unlock")
async def unlock_post(
    post_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Unlock a post to allow new replies."""
    post = await db.get(ForumPost, post_id)
    if post is None:
        raise atlas_error("FORUM_001", "Post not found.", status_code=404)
    if post.author_id != current_user.id and str(current_user.role) not in {"TEACHER", "ADMIN"}:
        raise atlas_error("AUTH_008", "You do not have permission to unlock this post.", status_code=403)

    post.is_locked = False
    post.updated_at = datetime.utcnow()
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": str(post.id), "is_locked": False}


@router.delete("/forums/replies/{reply_id}")
async def delete_reply(
    reply_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    """Delete a reply."""
    reply = await db.get(ForumReply, reply_id)
    if reply is None:
        raise atlas_error("FORUM_002", "Reply not found.", status_code=404)
    if reply.author_id != current_user.id and str(current_user.role) != "ADMIN":
        raise atlas_error("AUTH_008", "You do not have permission to delete this reply.", status_code=403)

    await db.delete(reply)
    await db.commit()
    return {"success": True}


@router.patch("/forums/replies/{reply_id}")
async def update_reply(
    reply_id: UUID,
    payload: ReplyPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Edit a reply."""
    reply = await db.get(ForumReply, reply_id)
    if reply is None:
        raise atlas_error("FORUM_002", "Reply not found.", status_code=404)
    if reply.author_id != current_user.id and str(current_user.role) != "ADMIN":
        raise atlas_error("AUTH_008", "You do not have permission to edit this reply.", status_code=403)

    reply.content_json = payload.content
    reply.updated_at = datetime.utcnow()
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return await _reply_payload(db, reply)


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
