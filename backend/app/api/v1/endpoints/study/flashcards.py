import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pydantic import BaseModel, Field

from app.db.session import get_session
# ARCHITECTURAL FIX: Explicitly import from the specific IAM dependency provider
from app.api.v1.endpoints.auth.me import get_current_user
from app.models.all_models import (
    User, DocumentVersion, FlashcardDeck, Flashcard
)

# ARCHITECTURAL FIX: Re-routed to the new Study Engine Bounded Context
from app.services.study_engine import flashcard_service
from app.services.study_engine.flashcard_service import ReviewButton

from app.core.limits import limiter
from app.core.celery_app import celery_app

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for SRS telemetry
logger = logging.getLogger("app.api.v1.endpoints.study.flashcards")
router = APIRouter()

# --- Pydantic Schemas ---

class GenerateDeckRequest(BaseModel):
    """Schema for requesting asynchronous flashcard generation."""
    document_version_id: uuid.UUID
    num_cards: int = Field(default=5, ge=1, le=20)

class ReviewCardRequest(BaseModel):
    """Schema for submitting a spaced-repetition review."""
    button: ReviewButton = Field(
        ...,
        description="Anki-style review assessment: AGAIN, HARD, GOOD, or EASY"
    )

# --- Flashcard Endpoints ---

@router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(limiter(10, 86400))]
)
async def generate_deck_async(
    payload: GenerateDeckRequest,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    US-15: Asynchronous generation of flashcards.
    Dispatches task to the Study Engine domain in Celery.
    """
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id)
    )
    doc = doc_query.scalars().first()

    if not doc or not doc.ocr_text:
        logger.warning(f"SRS Error: User {current_user.id} requested generation for invalid doc {payload.document_version_id}.")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not ready or missing OCR text."
        )

    # ARCHITECTURAL FIX: Updated task path to reflect new Study Engine domain
    task = celery_app.send_task(
        "app.services.study_engine.flashcard_tasks.generate_flashcards_task",
        args=[str(doc.id), str(current_user.id), payload.num_cards]
    )

    logger.info(f"AUDIT: Dispatched Flashcard Generation Task [{task.id}] for User [{current_user.id}].")

    return {
        "message": "Flashcard generation queued successfully.",
        "task_id": task.id,
        "status": "PROCESSING"
    }


@router.get("/documents/{document_version_id}/deck")
async def get_deck_by_document(
    document_version_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    US-16: Retrieval of deck metadata and mastery stats for the document header UI.
    """
    deck_query = await db_session.execute(
        select(FlashcardDeck).where(
            FlashcardDeck.document_version_id == document_version_id,
            FlashcardDeck.student_id == current_user.id
        )
    )
    deck = deck_query.scalars().first()
    if not deck:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found.")

    total_count = (
        await db_session.execute(
            select(func.count(Flashcard.id)).where(Flashcard.deck_id == deck.id)
        )
    ).scalar_one()

    due_count = (
        await db_session.execute(
            select(func.count(Flashcard.id)).where(
                Flashcard.deck_id == deck.id,
                Flashcard.next_review_at <= datetime.utcnow()
            )
        )
    ).scalar_one()

    mastered_count = (
        await db_session.execute(
            select(func.count(Flashcard.id)).where(
                Flashcard.deck_id == deck.id,
                Flashcard.repetitions > 0
            )
        )
    ).scalar_one()

    mastery_percentage = 0
    if total_count:
        mastery_percentage = int(round((mastered_count / total_count) * 100))

    return {
        "id": str(deck.id),
        "mastery_percentage": mastery_percentage,
        "due_cards_count": int(due_count or 0)
    }


@router.get("/decks")
async def list_user_decks(
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """Returns a list of all decks owned by the authenticated student."""
    query = await db_session.execute(
        select(FlashcardDeck).where(FlashcardDeck.student_id == current_user.id)
    )
    return {"decks": query.scalars().all()}


@router.get("/shared/{share_token}")
async def get_shared_deck(
    share_token: str,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """Allows a student to access a deck shared by another student via token."""
    query = await db_session.execute(
        select(FlashcardDeck).where(FlashcardDeck.share_token == share_token)
    )
    deck = query.scalars().first()

    if not deck:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared deck not found or link expired."
        )

    cards_query = await db_session.execute(
        select(Flashcard).where(Flashcard.deck_id == deck.id)
    )
    cards = cards_query.scalars().all()

    logger.info(f"AUDIT: User {current_user.id} accessed shared deck {deck.id}.")
    return {"deck": deck, "cards": cards}


@router.get("/decks/{deck_id}/review")
async def get_cards_for_review(
    deck_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """Retrieves all flashcards due for review within a specific deck."""
    deck_query = await db_session.execute(
        select(FlashcardDeck).where(
            FlashcardDeck.id == deck_id,
            FlashcardDeck.student_id == current_user.id
        )
    )
    if not deck_query.scalars().first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deck not found.")

    cards_query = await db_session.execute(
        select(Flashcard).where(
            Flashcard.deck_id == deck_id,
            Flashcard.next_review_at <= datetime.utcnow()
        )
    )
    due_cards = cards_query.scalars().all()
    return {"due_cards": due_cards, "count": len(due_cards)}


@router.patch("/{card_id}/review")
async def submit_card_review(
    card_id: uuid.UUID,
    payload: ReviewCardRequest,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """
    US-15: Logs an SM-2 review session.
    Calculates the next review interval based on user performance feedback.
    """
    query = await db_session.execute(
        select(Flashcard).join(FlashcardDeck).where(
            Flashcard.id == card_id,
            FlashcardDeck.student_id == current_user.id
        )
    )
    card = query.scalars().first()

    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found.")

    # Domain Logic: Map button and calculate SRS progression (Lego: Study Engine)
    quality = flashcard_service.map_button_to_quality(payload.button)

    new_reps, new_ease, new_interval = flashcard_service.calculate_sm2(
        quality, card.repetitions, card.ease_factor, card.interval
    )

    # State Persistence
    card.repetitions = new_reps
    card.ease_factor = new_ease
    card.interval = new_interval
    card.next_review_at = datetime.utcnow() + timedelta(days=new_interval)
    card.last_reviewed_at = datetime.utcnow()

    db_session.add(card)
    await db_session.commit()

    logger.info(f"AUDIT: Card {card.id} reviewed. Next review in {new_interval} days.")

    return {
        "message": "Review logged successfully",
        "next_review_at": card.next_review_at,
        "interval_days": new_interval
    }