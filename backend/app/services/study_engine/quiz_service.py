"""
Core Evaluation and Feedback Engine for Quiz Simulations.
Enforces zero-trust backend scoring, concurrent AI feedback generation, and state persistence.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import HTTPException, status

# DOMAIN MODELS & SOTA FUNCTIONAL SERVICES
from app.models.study_tools import QuizSession, Question

# ARCHITECT FIX: Corrected absolute import path to respect the domain boundary
from app.services.study_engine.generation_service import generate_feedback_for_missed_question

logger = logging.getLogger(__name__)

class AnswerSubmission(BaseModel):
    question_id: str
    student_answer: str = Field(..., description="The exact text or option key chosen by the user")

class QuizSubmitPayload(BaseModel):
    quiz_session_id: str
    answers: List[AnswerSubmission]
    time_spent_seconds: int = Field(..., ge=0, description="Total time spent in the simulation")

class QuestionFeedback(BaseModel):
    question_id: str
    is_correct: bool
    correct_answer: str
    student_answer: str
    ai_feedback: Optional[str] = None
    source_page: Optional[str] = None

class QuizEvaluationResult(BaseModel):
    attempt_id: str
    score: int
    total_questions: int
    percentage: float
    feedbacks: List[QuestionFeedback]

class QuizEvaluationEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _generate_targeted_feedback(self, question: Question, student_answer: str) -> str:
        """
        Invokes the standalone generation service for targeted corrective feedback.
        """
        source_chunk = getattr(question, 'source_chunk', 'Texte source non disponible.')

        try:
            source_page = int(getattr(question, 'source_page', 0) or 0)
        except (ValueError, TypeError):
            source_page = 0

        try:
            response = await generate_feedback_for_missed_question(
                question=question.question_text,
                student_answer=student_answer,
                correct_answer=question.correct_answer,
                source_text=source_chunk,
                source_page=source_page
            )
            return response
        except Exception as e:
            q_id = getattr(question, 'id', 'UNKNOWN')
            logger.error(f"Failed to generate AI feedback for question {q_id}: {str(e)}")
            return f"Tu as confondu {student_answer} avec {question.correct_answer}. (Erreur IA). Source : Page {source_page}"

    async def evaluate_and_store(self, user_id: str, payload: QuizSubmitPayload) -> QuizEvaluationResult:
        # 1. Fetch Session
        session_result = await self.db.execute(
            select(QuizSession).where(
                QuizSession.id == payload.quiz_session_id,
                QuizSession.student_id == user_id
            )
        )
        session_record = session_result.scalars().first()

        if not session_record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz session not found.")

        # Fetch Questions tied to the session
        questions_result = await self.db.execute(select(Question).where(Question.quiz_session_id == session_record.id))
        questions = questions_result.scalars().all()

        if not questions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session contains no questions.")

        question_map = {str(q.id): q for q in questions}
        score = 0
        total_questions = len(questions)
        feedbacks: List[QuestionFeedback] = []
        feedback_tasks = []

        for ans in payload.answers:
            q_entity = question_map.get(str(ans.question_id))
            if not q_entity:
                continue

            # Safe comparison handling potential None values
            correct_ans = q_entity.correct_answer or ""
            student_ans = ans.student_answer or ""
            is_correct = student_ans.strip().lower() == correct_ans.strip().lower()

            q_entity.student_answer = ans.student_answer
            q_entity.is_correct = is_correct

            source_p = str(getattr(q_entity, 'source_page', ''))

            if is_correct:
                score += 1
                feedbacks.append(QuestionFeedback(
                    question_id=str(q_entity.id),
                    is_correct=True,
                    correct_answer=correct_ans,
                    student_answer=student_ans,
                    source_page=source_p
                ))
            else:
                feedback_item = QuestionFeedback(
                    question_id=str(q_entity.id),
                    is_correct=False,
                    correct_answer=correct_ans,
                    student_answer=student_ans,
                    source_page=source_p
                )
                feedbacks.append(feedback_item)

                # Queue the AI generation task for concurrent execution
                task = self._generate_targeted_feedback(q_entity, student_ans)
                feedback_tasks.append((feedback_item, q_entity, task))

        # Execute all AI feedback generation concurrently
        if feedback_tasks:
            items, q_entities, awaitables = zip(*feedback_tasks)
            ai_responses = await asyncio.gather(*awaitables, return_exceptions=True)

            for item, q_entity, response in zip(items, q_entities, ai_responses):
                if isinstance(response, Exception):
                    error_msg = f"Erreur de génération. Source : Page {getattr(q_entity, 'source_page', 'inconnue')}"
                    item.ai_feedback = error_msg
                    q_entity.ai_feedback = error_msg
                else:
                    item.ai_feedback = response
                    q_entity.ai_feedback = response

        percentage = (score / total_questions) * 100 if total_questions > 0 else 0.0

        session_record.score = score
        session_record.is_completed = True
        session_record.submitted_at = datetime.now(timezone.utc)

        self.db.add(session_record)
        self.db.add_all(questions)
        await self.db.commit()

        return QuizEvaluationResult(
            attempt_id=str(session_record.id),
            score=score,
            total_questions=total_questions,
            percentage=percentage,
            feedbacks=feedbacks
        )