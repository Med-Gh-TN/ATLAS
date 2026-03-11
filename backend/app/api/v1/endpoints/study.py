import uuid
import logging
from datetime import datetime
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, Field

from app.db.session import get_session
from app.api.v1.endpoints.auth import get_current_user
from app.models.all_models import (
    User, DocumentVersion, FlashcardDeck, Flashcard, 
    QuizSession, Question, MindMap
)
from app.services.flashcard_service import generate_flashcards_from_text, calculate_sm2
from app.services.generation_service import generate_quiz_from_text, generate_mindmap_from_text, generate_summary_from_text
from app.core.limits import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Pydantic Schemas ---
class GenerateDeckRequest(BaseModel):
    document_version_id: uuid.UUID
    num_cards: int = Field(default=5, ge=1, le=20)

class ReviewCardRequest(BaseModel):
    quality: int = Field(..., ge=0, le=5, description="0=Blackout, 5=Perfect Recall")

class GenerateQuizRequest(BaseModel):
    document_version_id: uuid.UUID
    num_questions: int = Field(default=5, ge=1, le=15)

class SubmitQuizRequest(BaseModel):
    answers: Dict[str, str] = Field(..., description="Map of question_id to selected_option")

class GenerateMindMapRequest(BaseModel):
    document_version_id: uuid.UUID

class GenerateSummaryRequest(BaseModel):
    document_version_id: uuid.UUID
    format_type: str = Field(default="EXECUTIVE", description="EXECUTIVE or STRUCTURED")
    target_lang: str = Field(default="fr", description="Language code e.g., 'fr', 'ar', 'en'")


# --- Flashcard Endpoints ---

@router.post("/flashcards/generate", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(10, 86400))])
async def generate_deck(payload: GenerateDeckRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    doc_query = await db_session.execute(select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id))
    doc = doc_query.scalars().first()
    if not doc or not doc.ocr_text:
        raise HTTPException(status_code=404, detail="Document not ready.")

    raw_cards = await generate_flashcards_from_text(doc.ocr_text, num_cards=payload.num_cards)
    if not raw_cards:
        raise HTTPException(status_code=422, detail="Failed to extract concepts.")

    deck = FlashcardDeck(
        student_id=current_user.id,
        document_version_id=doc.id,
        title=f"Generated Deck - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
        card_count=len(raw_cards)
    )
    db_session.add(deck)
    await db_session.flush()

    for card_data in raw_cards:
        card = Flashcard(deck_id=deck.id, question=card_data.get("question", ""), answer=card_data.get("answer", ""))
        db_session.add(card)

    await db_session.commit()
    await db_session.refresh(deck)
    return {"message": "Deck generated", "deck_id": deck.id, "share_token": deck.share_token}


@router.get("/flashcards/decks")
async def list_user_decks(current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    query = await db_session.execute(select(FlashcardDeck).where(FlashcardDeck.student_id == current_user.id))
    return {"decks": query.scalars().all()}


@router.get("/flashcards/shared/{share_token}")
async def get_shared_deck(share_token: str, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    """Allows a student to import a deck shared by another student using the public share_token."""
    query = await db_session.execute(select(FlashcardDeck).where(FlashcardDeck.share_token == share_token))
    deck = query.scalars().first()
    if not deck:
        raise HTTPException(status_code=404, detail="Shared deck not found or link expired.")
    
    cards_query = await db_session.execute(select(Flashcard).where(Flashcard.deck_id == deck.id))
    cards = cards_query.scalars().all()
    return {"deck": deck, "cards": cards}


@router.get("/flashcards/decks/{deck_id}/review")
async def get_cards_for_review(deck_id: uuid.UUID, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    deck_query = await db_session.execute(select(FlashcardDeck).where(FlashcardDeck.id == deck_id, FlashcardDeck.student_id == current_user.id))
    if not deck_query.scalars().first():
        raise HTTPException(status_code=404, detail="Deck not found.")

    cards_query = await db_session.execute(select(Flashcard).where(Flashcard.deck_id == deck_id, Flashcard.next_review_at <= datetime.utcnow()))
    due_cards = cards_query.scalars().all()
    return {"due_cards": due_cards, "count": len(due_cards)}


@router.post("/flashcards/{card_id}/review")
async def submit_card_review(card_id: uuid.UUID, payload: ReviewCardRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    query = await db_session.execute(select(Flashcard).join(FlashcardDeck).where(Flashcard.id == card_id, FlashcardDeck.student_id == current_user.id))
    card = query.scalars().first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")

    from datetime import timedelta
    new_reps, new_ease, new_interval = calculate_sm2(payload.quality, card.repetitions, card.ease_factor, card.interval)

    card.repetitions = new_reps
    card.ease_factor = new_ease
    card.interval = new_interval
    card.next_review_at = datetime.utcnow() + timedelta(days=new_interval)

    db_session.add(card)
    await db_session.commit()
    return {"message": "Review logged", "next_review_at": card.next_review_at}


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

@router.post("/summaries/generate", dependencies=[Depends(limiter(5, 86400))])
async def generate_summary(payload: GenerateSummaryRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    """Generates an AI summary in the specified format and language."""
    doc_query = await db_session.execute(select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id))
    doc = doc_query.scalars().first()
    if not doc or not doc.ocr_text:
        raise HTTPException(status_code=404, detail="Document not ready.")

    summary_data = await generate_summary_from_text(doc.ocr_text, payload.format_type, payload.target_lang)
    return summary_data


@router.post("/mindmaps/generate", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limiter(5, 86400))])
async def generate_mindmap(payload: GenerateMindMapRequest, current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_session)):
    doc_query = await db_session.execute(select(DocumentVersion).where(DocumentVersion.id == payload.document_version_id))
    doc = doc_query.scalars().first()
    if not doc or not doc.ocr_text:
        raise HTTPException(status_code=404, detail="Document not ready.")

    graph_data = await generate_mindmap_from_text(doc.ocr_text)
    if not graph_data or not graph_data["nodes"]:
        raise HTTPException(status_code=422, detail="Failed to generate concept map.")

    mind_map = MindMap(
        student_id=current_user.id,
        document_version_id=doc.id,
        nodes_json=graph_data["nodes"],
        edges_json=graph_data["edges"]
    )
    db_session.add(mind_map)
    await db_session.commit()
    await db_session.refresh(mind_map)
    
    return {"mindmap_id": mind_map.id, "nodes": mind_map.nodes_json, "edges": mind_map.edges_json}