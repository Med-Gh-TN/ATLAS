import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, Field

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import (
    User, DocumentVersion, FlashcardDeck, Flashcard, 
    QuizSession, Question, MindMap, Summary, SummaryFormat
)
from app.services.flashcard_service import (
    calculate_sm2, ReviewButton, map_button_to_quality
)
from app.services.generation_service import (
    generate_quiz_from_text, generate_mindmap_from_text, generate_summary_from_text
)
from app.services.export_service import generate_pdf_from_summary
from app.core.limits import limiter
from app.core.celery_app import celery_app

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Pydantic Schemas ---
class GenerateDeckRequest(BaseModel):
    document_version_id: uuid.UUID
    num_cards: int = Field(default=5, ge=1, le=20)

class ReviewCardRequest(BaseModel):
    button: ReviewButton = Field(
        ..., 
        description="Anki-style review assessment: AGAIN, HARD, GOOD, or EASY"
    )

class GenerateQuizRequest(BaseModel):
    document_version_id: uuid.UUID
    num_questions: int = Field(default=5, ge=1, le=15)

class SubmitQuizRequest(BaseModel):
    answers: Dict[str, str] = Field(..., description="Map of question_id to selected_option")

class GenerateMindMapRequest(BaseModel):
    document_version_id: uuid.UUID
    target_lang: str = Field(default="fr", description="Language code e.g., 'fr', 'ar', 'en'")

class GenerateSummaryRequest(BaseModel):
    document_version_id: uuid.UUID
    document_version_id_v2: Optional[uuid.UUID] = Field(default=None, description="Required only for COMPARATIVE format")
    format_type: SummaryFormat = Field(default=SummaryFormat.EXECUTIVE, description="EXECUTIVE, STRUCTURED, or COMPARATIVE")
    target_lang: str = Field(default="fr", description="Language code e.g., 'fr', 'ar', 'en'")


# --- Flashcard Endpoints ---

@router.post(
    "/flashcards/generate", 
    status_code=status.HTTP_202_ACCEPTED, 
    dependencies=[Depends(limiter(10, 86400))]
)
async def generate_deck_async(
    payload: GenerateDeckRequest, 
    current_user: User = Depends(get_current_user), 
    db_session: AsyncSession = Depends(get_session)
):
    """
    US-15: Asynchronous generation of flashcards to prevent HTTP timeout.
    Dispatches task to Celery. Worker will emit webhook upon completion.
    """
    doc_query = await db_session.execute(
        select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id)
    )
    doc = doc_query.scalars().first()
    
    if not doc or not doc.ocr_text:
        logger.warning(f"User {current_user.id} attempted to generate flashcards for invalid/empty document {payload.document_version_id}.")
        raise HTTPException(status_code=404, detail="Document not ready or missing OCR text.")

    # Dispatch to Celery for async processing
    # The worker will handle the LLM call, DB persistence, and Webhook dispatch
    task = celery_app.send_task(
        "app.services.flashcard_tasks.generate_flashcards_task",
        args=[str(doc.id), str(current_user.id), payload.num_cards]
    )
    
    logger.info(f"Dispatched Flashcard Generation Task [{task.id}] for User [{current_user.id}].")

    return {
        "message": "Flashcard generation queued successfully. You will be notified via webhook.",
        "task_id": task.id,
        "status": "PROCESSING"
    }


@router.get("/flashcards/decks")
async def list_user_decks(
    current_user: User = Depends(get_current_user), 
    db_session: AsyncSession = Depends(get_session)
):
    query = await db_session.execute(
        select(FlashcardDeck).where(FlashcardDeck.student_id == current_user.id)
    )
    return {"decks": query.scalars().all()}


@router.get("/flashcards/shared/{share_token}")
async def get_shared_deck(
    share_token: str, 
    current_user: User = Depends(get_current_user), 
    db_session: AsyncSession = Depends(get_session)
):
    """Allows a student to import a deck shared by another student using the public share_token."""
    query = await db_session.execute(
        select(FlashcardDeck).where(FlashcardDeck.share_token == share_token)
    )
    deck = query.scalars().first()
    
    if not deck:
        raise HTTPException(status_code=404, detail="Shared deck not found or link expired.")
    
    cards_query = await db_session.execute(
        select(Flashcard).where(Flashcard.deck_id == deck.id)
    )
    cards = cards_query.scalars().all()
    
    # Audit side-effect: Log when shared decks are accessed
    logger.info(f"User {current_user.id} accessed shared deck {deck.id}.")
    
    return {"deck": deck, "cards": cards}


@router.get("/flashcards/decks/{deck_id}/review")
async def get_cards_for_review(
    deck_id: uuid.UUID, 
    current_user: User = Depends(get_current_user), 
    db_session: AsyncSession = Depends(get_session)
):
    deck_query = await db_session.execute(
        select(FlashcardDeck).where(FlashcardDeck.id == deck_id, FlashcardDeck.student_id == current_user.id)
    )
    if not deck_query.scalars().first():
        raise HTTPException(status_code=404, detail="Deck not found.")

    cards_query = await db_session.execute(
        select(Flashcard).where(
            Flashcard.deck_id == deck_id, 
            Flashcard.next_review_at <= datetime.utcnow()
        )
    )
    due_cards = cards_query.scalars().all()
    return {"due_cards": due_cards, "count": len(due_cards)}


@router.patch("/flashcards/{card_id}/review")
async def submit_card_review(
    card_id: uuid.UUID, 
    payload: ReviewCardRequest, 
    current_user: User = Depends(get_current_user), 
    db_session: AsyncSession = Depends(get_session)
):
    """US-15: Endpoint notation (Again / Hard / Good / Easy à la Anki)."""
    query = await db_session.execute(
        select(Flashcard).join(FlashcardDeck).where(
            Flashcard.id == card_id, 
            FlashcardDeck.student_id == current_user.id
        )
    )
    card = query.scalars().first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or unauthorized.")

    # Convert Anki-style button to strict SM-2 quality (0-5)
    quality = map_button_to_quality(payload.button)

    # Process SM-2 math
    new_reps, new_ease, new_interval = calculate_sm2(
        quality, card.repetitions, card.ease_factor, card.interval
    )

    # Update state persistence
    card.repetitions = new_reps
    card.ease_factor = new_ease
    card.interval = new_interval
    card.next_review_at = datetime.utcnow() + timedelta(days=new_interval)
    card.last_reviewed_at = datetime.utcnow() # Audit trailing

    db_session.add(card)
    await db_session.commit()
    
    logger.info(f"Card {card.id} reviewed by User {current_user.id}. Next review in {new_interval} days.")
    
    return {
        "message": "Review logged successfully", 
        "next_review_at": card.next_review_at,
        "interval_days": new_interval
    }


# --- Quiz Endpoints ---

@router.post("/quizzes/generate", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(5, 86400))])
async def generate_quiz(payload: GenerateQuizRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    doc_query = await db_session.execute(select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id))
    doc = doc_query.scalars().first()
    if not doc or not doc.ocr_text:
        raise HTTPException(status_code=404, detail="Document not ready.")

    raw_questions = await generate_quiz_from_text(doc.ocr_text, payload.num_questions)
    if not raw_questions:
        raise HTTPException(status_code=422, detail="Failed to generate quiz.")

    quiz_session = QuizSession(student_id=current_user.id, document_version_id=doc.id, total_questions=len(raw_questions))
    db_session.add(quiz_session)
    await db_session.flush()

    for q_data in raw_questions:
        question = Question(
            quiz_session_id=quiz_session.id,
            content=q_data.get("content", ""),
            question_type="MCQ",
            options=q_data.get("options", []),
            correct_answer=q_data.get("correct_answer", ""),
            explanation=q_data.get("explanation", "")
        )
        db_session.add(question)

    await db_session.commit()
    return {"quiz_session_id": quiz_session.id, "questions": raw_questions}


@router.post("/quizzes/{session_id}/submit")
async def submit_quiz(session_id: uuid.UUID, payload: SubmitQuizRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    """Calculates score based on submitted answers and records the result."""
    session_query = await db_session.execute(select(QuizSession).where(QuizSession.id == session_id, QuizSession.student_id == current_user.id))
    quiz_session = session_query.scalars().first()
    
    if not quiz_session:
        raise HTTPException(status_code=404, detail="Quiz session not found.")
    if quiz_session.submitted_at:
        raise HTTPException(status_code=400, detail="Quiz already submitted.")

    q_query = await db_session.execute(select(Question).where(Question.quiz_session_id == session_id))
    questions = q_query.scalars().all()
    
    correct_count = 0
    feedback = []

    for q in questions:
        user_answer = payload.answers.get(str(q.id))
        is_correct = user_answer == q.correct_answer
        if is_correct:
            correct_count += 1
        
        feedback.append({
            "question_id": q.id,
            "is_correct": is_correct,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation
        })

    final_score = (correct_count / len(questions)) * 100 if questions else 0.0
    quiz_session.score = final_score
    quiz_session.submitted_at = datetime.utcnow()
    
    db_session.add(quiz_session)
    await db_session.commit()

    return {"score": final_score, "feedback": feedback}


# --- Summary & Mind Map Endpoints ---

@router.post("/summaries/generate", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(5, 86400))])
async def generate_summary(payload: GenerateSummaryRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    """US-18: Generates and persists an AI summary across 3 possible formats."""
    doc_query = await db_session.execute(select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id))
    doc = doc_query.scalars().first()
    if not doc or not doc.ocr_text:
        raise HTTPException(status_code=404, detail="Primary document not ready or missing text.")

    text_v2 = None
    if payload.format_type == SummaryFormat.COMPARATIVE:
        if not payload.document_version_id_v2:
            raise HTTPException(status_code=400, detail="COMPARATIVE format requires document_version_id_v2.")
        doc_v2_query = await db_session.execute(select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id_v2))
        doc_v2 = doc_v2_query.scalars().first()
        if not doc_v2 or not doc_v2.ocr_text:
            raise HTTPException(status_code=404, detail="Secondary document version not ready.")
        text_v2 = doc_v2.ocr_text

    # Cross-layer LLM invocation
    summary_data = await generate_summary_from_text(
        text=doc.ocr_text, 
        format_type=payload.format_type.value, 
        target_lang=payload.target_lang,
        text_v2=text_v2
    )
    
    if "error" in summary_data:
        raise HTTPException(status_code=422, detail=summary_data["error"])

    # State persistence
    summary = Summary(
        student_id=current_user.id,
        document_version_id=doc.id,
        format=payload.format_type,
        target_lang=payload.target_lang,
        content=summary_data
    )
    db_session.add(summary)
    await db_session.commit()
    await db_session.refresh(summary)

    # Auditing
    logger.info(f"Summary [{summary.id}] generated for User [{current_user.id}] (Format: {payload.format_type.value}).")

    return {"summary_id": summary.id, "format": summary.format, "content": summary.content}


@router.get("/summaries/{summary_id}/export/pdf")
async def export_summary_pdf(
    summary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_session)
):
    """US-18: Exports a generated summary to a high-fidelity PDF document."""
    query = await db_session.execute(
        select(Summary).where(Summary.id == summary_id, Summary.student_id == current_user.id)
    )
    summary = query.scalars().first()

    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found or unauthorized.")

    try:
        pdf_bytes = generate_pdf_from_summary(summary)
        logger.info(f"Summary [{summary.id}] exported to PDF by User [{current_user.id}].")
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=ATLAS_Summary_{summary.id}.pdf"}
        )
    except RuntimeError as e:
        logger.error(f"PDF export failed: {str(e)}")
        raise HTTPException(status_code=500, detail="PDF generation service is currently unavailable.")


@router.post("/mindmaps/generate", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(5, 86400))])
async def generate_mindmap(payload: GenerateMindMapRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    """US-18: Generates and persists an interactive React Flow compatible concept map."""
    doc_query = await db_session.execute(select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id))
    doc = doc_query.scalars().first()
    if not doc or not doc.ocr_text:
        raise HTTPException(status_code=404, detail="Document not ready.")

    graph_data = await generate_mindmap_from_text(doc.ocr_text, target_lang=payload.target_lang)
    if not graph_data or not graph_data.get("nodes"):
        raise HTTPException(status_code=422, detail="Failed to generate concept map.")

    mind_map = MindMap(
        student_id=current_user.id,
        document_version_id=doc.id,
        title=f"Concept Map - Document {str(doc.id)[:8]}",
        target_lang=payload.target_lang,
        nodes_json=graph_data["nodes"],
        edges_json=graph_data["edges"]
    )
    db_session.add(mind_map)
    await db_session.commit()
    await db_session.refresh(mind_map)
    
    logger.info(f"MindMap [{mind_map.id}] generated for User [{current_user.id}].")

    return {
        "mindmap_id": mind_map.id, 
        "title": mind_map.title,
        "target_lang": mind_map.target_lang,
        "nodes": mind_map.nodes_json, 
        "edges": mind_map.edges_json
    }