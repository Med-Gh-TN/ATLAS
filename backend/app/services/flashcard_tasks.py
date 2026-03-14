import asyncio
import logging
import os
import uuid
import httpx
from datetime import datetime

from sqlalchemy.future import select

# Assuming celery_app is correctly initialized in core
from app.core.celery_app import celery_app
from app.db.session import get_session
from app.models.all_models import DocumentVersion, FlashcardDeck, Flashcard, Notification
from app.services.flashcard_service import generate_flashcards_from_text

logger = logging.getLogger(__name__)

async def _dispatch_webhook(student_id: uuid.UUID, status: str, payload: dict):
    """
    US-15: Webhook status dispatch side-effect.
    Fires an event to an external listener (if configured) upon task completion or failure.
    """
    webhook_url = os.getenv("WEBHOOK_URL")
    if not webhook_url:
        logger.info(f"No WEBHOOK_URL configured. Skipping external webhook dispatch for User {student_id}.")
        return

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                webhook_url,
                json={
                    "event": "flashcard_generation",
                    "student_id": str(student_id),
                    "status": status,
                    "data": payload,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
            response.raise_for_status()
            logger.info(f"Webhook [{status}] dispatched successfully for student {student_id}.")
    except Exception as e:
        # We catch and log this so a failed webhook doesn't crash the core task
        logger.error(f"Failed to dispatch webhook for student {student_id}: {e}")

async def _process_flashcard_generation(doc_version_id_str: str, student_id_str: str, num_cards: int):
    """
    Core asynchronous logic for generating flashcards, persisting state, and firing side-effects.
    """
    doc_version_id = uuid.UUID(doc_version_id_str)
    student_id = uuid.UUID(student_id_str)
    
    # Manually consume the async session generator for the background task
    session_gen = get_session()
    db_session = await anext(session_gen)
    
    try:
        # 1. Fetch Context
        doc_query = await db_session.execute(
            select(DocumentVersion).where(DocumentVersion.id == doc_version_id)
        )
        doc = doc_query.scalars().first()
        
        if not doc or not doc.ocr_text:
            raise ValueError(f"Document {doc_version_id} not found or missing OCR text.")

        # 2. Execute AI Generation (Core Logic)
        logger.info(f"Task started: AI flashcard generation for doc {doc_version_id}...")
        raw_cards = await generate_flashcards_from_text(doc.ocr_text, num_cards)
        
        if not raw_cards:
            raise ValueError("AI failed to extract valid flashcard concepts.")

        # 3. State Persistence
        deck = FlashcardDeck(
            student_id=student_id,
            document_version_id=doc.id,
            title=f"AI Deck - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            card_count=len(raw_cards)
        )
        db_session.add(deck)
        await db_session.flush() # Flush to get deck.id for foreign keys

        for card_data in raw_cards:
            card = Flashcard(
                deck_id=deck.id,
                question=card_data.get("question", ""),
                answer=card_data.get("answer", ""),
                difficulty=card_data.get("difficulty", "MEDIUM") # Fallback protection
            )
            db_session.add(card)

        # 4. Side Effects: In-App Notification Integration
        notification = Notification(
            user_id=student_id,
            title="Flashcards Ready!",
            message=f"Your {len(raw_cards)} flashcards have been successfully generated and are ready for review.",
        )
        db_session.add(notification)
        
        await db_session.commit()
        
        # 5. Side Effects: Webhook Status (US-15)
        await _dispatch_webhook(
            student_id, 
            "SUCCESS", 
            {"deck_id": str(deck.id), "card_count": deck.card_count}
        )
        
    except Exception as e:
        # Defensive architecture: Strict rollback on failure to prevent partial commits
        await db_session.rollback()
        logger.error(f"Flashcard generation task failed: {e}")
        
        # Side Effects: Failure Notification & Webhook
        failure_notif = Notification(
            user_id=student_id,
            title="Generation Failed",
            message="We encountered an issue while generating your flashcards. Please try again later.",
        )
        db_session.add(failure_notif)
        await db_session.commit()
        
        await _dispatch_webhook(student_id, "FAILED", {"error": str(e)})
        raise e # Re-raise to trigger Celery retry mechanism
        
    finally:
        await db_session.close()

@celery_app.task(name="app.services.flashcard_tasks.generate_flashcards_task", bind=True, max_retries=3)
def generate_flashcards_task(self, doc_version_id: str, student_id: str, num_cards: int):
    """
    Celery Sync-to-Async boundary. 
    Executes the AI flashcard pipeline in an isolated background thread loop.
    """
    try:
        # Defensive isolation: Create a new event loop for this specific worker thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(
            _process_flashcard_generation(doc_version_id, student_id, num_cards)
        )
    except Exception as exc:
        logger.error(f"Celery Task Exception for doc {doc_version_id}: {exc}")
        # Defensive architecture: Exponential backoff retry (e.g., 60s, 120s, 240s)
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
    finally:
        loop.close()