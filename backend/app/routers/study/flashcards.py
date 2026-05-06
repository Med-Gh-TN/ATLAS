"""
@file backend/app/routers/study/flashcards.py
@description Domain-driven router for Flashcard Generation and SM2 Spaced Repetition.
@layer Core Logic
@dependencies app.models, app.services.intelligence
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.db.session import get_session
from app.dependencies import get_current_user
from app.models.contribution import Contribution, DocumentVersion
from app.models.course import Course
from app.models.study_tools import Flashcard, FlashcardDeck
from app.models.user import User
from app.services.intelligence import flashcard_service, generation_service
from app.services.intelligence.flashcard_service import ReviewButton

router = APIRouter()

class FlashcardGenerateRequest(BaseModel):
    course_id: UUID
    document_version_ids: list[UUID] = Field(default_factory=list)
    num_cards: int = Field(default=10, ge=1, le=20)

class FlashcardReviewRequest(BaseModel):
    rating: ReviewButton

async def _latest_document_version(db: AsyncSession, course_id: UUID) -> DocumentVersion:
    result = await db.execute(
        select(DocumentVersion)
        .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
        .where(
            Contribution.course_id == course_id,
            DocumentVersion.is_deleted.is_(False),
        )
        .order_by(desc(DocumentVersion.version_number))
        .limit(1)
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise atlas_error("COURSE_001", "Course not found.", status_code=404)
    return version

def _resolve_document_uuids(payload_uuids: list[UUID], latest_version: DocumentVersion) -> list[UUID]:
    return payload_uuids if len(payload_uuids) > 0 else [latest_version.id]

def _serialize_flashcard(card: Flashcard) -> dict[str, Any]:
    return {
        "id": str(card.id),
        "question": card.question,
        "answer": card.answer,
        "difficulty": card.difficulty,
        "next_review_at": card.next_review_at,
        "interval": card.interval,
        "ease_factor": card.ease_factor,
        "repetitions": card.repetitions,
    }

# ============================================================================
# FLASHCARDS
# ============================================================================
@router.post("/flashcards/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_flashcards(
    payload: FlashcardGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    version = await _latest_document_version(db, payload.course_id)
    doc_uuids = _resolve_document_uuids(payload.document_version_ids, version)
    
    try:
        deck = await generation_service.generate_and_persist_flashcards(
            document_version_ids=doc_uuids,
            num_cards=payload.num_cards,
            user=current_user,
            session=db
        )
        return {"job_id": str(deck.id), "status": "READY"}
    except RuntimeError as e:
        if "exhausted ALL models" in str(e) or "503" in str(e) or "429" in str(e):
            raise atlas_error("AI_503", "The AI provider is currently experiencing high demand. Please try again in a few moments.", status_code=503)
        raise atlas_error("GEN_500", f"Generation failed: {str(e)}", status_code=500)


@router.get("/flashcards/decks")
async def list_flashcard_decks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(FlashcardDeck).where(FlashcardDeck.student_id == current_user.id).order_by(desc(FlashcardDeck.created_at))
    )
    decks = result.scalars().all()
    return [
        {
            "id": str(deck.id),
            "title": deck.title,
            "card_count": deck.card_count,
            "document_count": len(deck.document_version_ids) if deck.document_version_ids else 0,
            "share_token": deck.share_token,
            "created_at": deck.created_at,
        }
        for deck in decks
    ]


@router.get("/flashcards/decks/{deck_id}")
async def get_flashcard_deck(
    deck_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    deck = await db.get(FlashcardDeck, deck_id)
    if deck is None or deck.student_id != current_user.id:
        raise atlas_error("FLASHCARD_002", "Deck not found.", status_code=404)

    cards_result = await db.execute(select(Flashcard).where(Flashcard.deck_id == deck_id))
    cards = cards_result.scalars().all()

    total_cards = len(cards)
    due_cards = sum(1 for c in cards if c.next_review_at and c.next_review_at <= datetime.utcnow())
    studied_cards = sum(1 for c in cards if c.repetitions and c.repetitions > 0)

    course_info = None
    if deck.document_version_ids and len(deck.document_version_ids) > 0:
        from sqlalchemy import select as sa_select
        version_result = await db.execute(
            sa_select(DocumentVersion, Contribution, Course)
            .join(Contribution, Contribution.id == DocumentVersion.contribution_id)
            .join(Course, Course.id == Contribution.course_id)
            .where(DocumentVersion.id == deck.document_version_ids[0])
        )
        row = version_result.first()
        if row:
            _, _, course = row
            course_info = {
                "id": str(course.id),
                "title": course.title,
                "academic_year": course.academic_year,
                "language": course.language,
                "document_count": len(deck.document_version_ids)
            }

    return {
        "id": str(deck.id),
        "title": deck.title,
        "card_count": deck.card_count,
        "share_token": deck.share_token,
        "course": course_info,
        "progress": {
            "total_cards": total_cards,
            "studied_cards": studied_cards,
            "due_cards": due_cards,
            "mastery_percentage": round((studied_cards / total_cards * 100), 1) if total_cards > 0 else 0,
        },
        "cards": [_serialize_flashcard(card) for card in cards],
    }


@router.get("/flashcards/due")
async def get_due_flashcards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    result = await db.execute(
        select(Flashcard)
        .join(FlashcardDeck, FlashcardDeck.id == Flashcard.deck_id)
        .where(
            FlashcardDeck.student_id == current_user.id,
            Flashcard.next_review_at <= datetime.utcnow(),
        )
        .order_by(Flashcard.next_review_at.asc())
    )
    cards = result.scalars().all()
    return {"items": [_serialize_flashcard(card) for card in cards], "total": len(cards)}


@router.patch("/flashcards/{card_id}/review")
async def review_flashcard(
    card_id: UUID,
    payload: FlashcardReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    result = await db.execute(
        select(Flashcard)
        .join(FlashcardDeck, FlashcardDeck.id == Flashcard.deck_id)
        .where(Flashcard.id == card_id, FlashcardDeck.student_id == current_user.id)
    )
    card = result.scalar_one_or_none()
    if card is None:
        raise atlas_error("FLASHCARD_003", "Card not found.", status_code=404)

    quality = flashcard_service.map_button_to_quality(payload.rating)
    repetitions, ease_factor, interval = flashcard_service.calculate_sm2(
        quality,
        card.repetitions,
        card.ease_factor,
        card.interval,
    )
    card.repetitions = repetitions
    card.ease_factor = ease_factor
    card.interval = interval
    card.last_reviewed_at = datetime.utcnow()
    card.next_review_at = datetime.utcnow() + timedelta(days=interval)
    db.add(card)
    await db.commit()

    return {
        "id": str(card.id),
        "next_review_at": card.next_review_at,
        "interval_days": card.interval,
        "ease_factor": card.ease_factor,
        "repetitions": card.repetitions,
    }