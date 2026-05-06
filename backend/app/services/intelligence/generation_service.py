"""
@file backend/app/services/intelligence/generation_service.py
@description Production‑grade asset generation via ATLAS‑OCR sovereign edge.
             Idempotent: returns existing asset if already generated.
@layer Core Logic
@dependencies infrastructure.llm.bridge, app.models.study_tools, app.models.contribution
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import atlas_error
from app.models.contribution import DocumentVersion
from app.models.study_tools import (
    Flashcard,
    FlashcardDeck,
    MindMap,
    Question,
    QuizSession,
    Summary,
)
from app.models.user import User

logger = logging.getLogger(__name__)

# ----- Prompt templates (unchanged) -----
FLASHCARD_PROMPT = """
You are an expert academic curriculum designer specializing in cognitive science
and spaced‑repetition learning systems (Anki, SuperMemo). Your single task is to
transform the provided academic document into the highest‑quality set of digital
flashcards.

## PEDAGOGICAL RULES (NON‑NEGOTIABLE)
1. Generate exactly {num_cards} flashcards.
2. FRONT: A single, atomic, testable prompt. Never a statement. Max 25 words.
   Preferred patterns: "What is...?", "Define...", "What formula gives...?",
   "How does X differ from Y?", "State the theorem for..."
3. BACK: A complete, self‑contained answer. Max 90 words. Must answer the FRONT
   fully without needing to re‑read the document.
4. Coverage mandate — include at least one card from each cognitive level:
   RECALL, COMPREHENSION, APPLICATION.
5. For mathematical/scientific content: wrap LaTeX in $...$ for inline, $$...$$ for block.
6. For code concepts: include the language identifier and a concise, correct snippet.
7. NEVER produce trivial, redundant, or excessively obvious cards.
8. NEVER truncate the back answer.

## ANTI‑HALLUCINATION GUARD
Extract ONLY concepts explicitly present in the document.

## OUTPUT FORMAT — STRICTLY ENFORCED
Respond with ONLY a valid JSON array. No markdown fences. No preamble. No postamble.
Schema: [{{"front": "string", "back": "string"}}]
"""

QUIZ_PROMPT = """
You are an expert academic examiner. Transform the provided document into a
rigorous, well‑structured examination.

## EXAM STRUCTURE RULES (NON‑NEGOTIABLE)
1. Generate exactly {mcq_count} Multiple Choice Questions (MCQ) and {written_count}
   Open/Written Questions.
2. MCQ Guidelines:
   - Must have exactly 4 options labeled "A", "B", "C", and "D".
   - Only ONE option can be correct.
   - Include a concise explanation of WHY the answer is correct.
3. Written Guidelines:
   - Questions should require synthesis, analysis, or explanation.
   - Provide a "model_answer" that a grader would use to evaluate a response.

## ANTI‑HALLUCINATION GUARD
Base ALL questions and answers STRICTLY on the provided document.

## OUTPUT FORMAT — STRICTLY ENFORCED
Respond with ONLY a valid JSON object. No markdown fences. No preamble.
Schema:
{{
  "mcq": [
    {{
      "question": "string",
      "options": {{"A": "string", "B": "string", "C": "string", "D": "string"}},
      "answer": "A" | "B" | "C" | "D",
      "explanation": "string"
    }}
  ],
  "written": [
    {{
      "question": "string",
      "model_answer": "string"
    }}
  ]
}}
"""

SUMMARY_PROMPT = """
You are an expert academic analyst. Distill the provided document into a highly
structured professional executive summary.

## RULES
1. **Overview:** 2‑3 paragraph executive summary of the entire document.
2. **Key Concepts:** 5 to 10 critical facts, definitions, or arguments as bullet points.
3. **Conclusion:** Brief final takeaway or main conclusion.

## ANTI‑HALLUCINATION GUARD
Base ALL information STRICTLY on the provided document.

## OUTPUT FORMAT — STRICTLY ENFORCED
Respond with ONLY a raw, valid JSON object. No markdown fences. The root must start
with the "overview" key and contain EXACTLY these three keys:
{{
  "overview": "string",
  "key_concepts": ["string", "string"],
  "conclusion": "string"
}}
"""

MINDMAP_PROMPT = """
You are an expert knowledge architect. Transform the provided academic document
into a comprehensive Mermaid.js mindmap.

## STRUCTURAL RULES
1. Single root node (wrapped in double parentheses).
2. 4 to 7 first‑level branches representing major themes.
3. Each first‑level branch has 2 to 6 second‑level leaf nodes.
4. Labels concise and precise — max 7 words.
5. The tree must be logically consistent and cover the full document.

## MERMAID SYNTAX
- Start with exactly: mindmap
- Indent with 2 spaces per level.
- Root uses double parentheses: root((Topic Name))
- No special characters in labels.

## ANTI‑HALLUCINATION GUARD
Map ONLY concepts explicitly present in the document.

## OUTPUT FORMAT — STRICTLY ENFORCED
Respond with ONLY the raw Mermaid.js mindmap syntax. No markdown fences.
Start with the literal characters: mindmap
"""

# ----- Bridge access -----
async def _get_bridge():
    from infrastructure.llm.bridge import _BRIDGE_INSTANCE, OmniModelBridge
    if _BRIDGE_INSTANCE is None:
        logger.info("OmniModelBridge not initialised – creating instance.")
        bridge = OmniModelBridge()
        await bridge.async_init()
        return bridge
    return _BRIDGE_INSTANCE


async def _fetch_document_text(db: AsyncSession, doc_uuids: list[UUID]) -> str:
    result = await db.execute(
        select(DocumentVersion).where(DocumentVersion.id.in_(doc_uuids))
    )
    versions = result.scalars().all()
    if not versions:
        raise atlas_error("DOC_001", "No document versions found for the given IDs.", status_code=404)
    texts = [v.ocr_text.strip() for v in versions if v.ocr_text and v.ocr_text.strip()]
    if not texts:
        raise atlas_error(
            "DOC_002",
            "The selected documents have no extracted text. "
            "Please ensure they have been fully processed before generating assets.",
            status_code=422,
        )
    return "\n\n".join(texts)


def _safe_json_parse(raw: str) -> Any:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse LLM response as JSON: %s", exc)
        raise RuntimeError("The AI returned an invalid format. Please try again.")


def _extract_mindmap_syntax(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        start_idx = 1 if lines[0].startswith("```") else 0
        end_idx = -1 if lines[-1].startswith("```") else len(lines)
        cleaned = "\n".join(lines[start_idx:end_idx]).strip()
    if not cleaned.startswith("mindmap"):
        raise RuntimeError("The mindmap syntax does not start with 'mindmap'.")
    return cleaned


# ----- Idempotency helpers -----
async def _find_existing_deck(
    db: AsyncSession, student_id: UUID, doc_version_ids: list[UUID]
) -> Optional[FlashcardDeck]:
    result = await db.execute(
        select(FlashcardDeck).where(
            FlashcardDeck.student_id == student_id,
            FlashcardDeck.document_version_ids == doc_version_ids,
        )
    )
    rows = result.scalars().all()
    if len(rows) > 1:
        logger.warning("Duplicate flashcard decks for student %s and versions %s", student_id, doc_version_ids)
    return rows[0] if rows else None


async def _find_existing_quiz(
    db: AsyncSession, student_id: UUID, doc_version_ids: list[UUID]
) -> Optional[QuizSession]:
    result = await db.execute(
        select(QuizSession).where(
            QuizSession.student_id == student_id,
            QuizSession.document_version_ids == doc_version_ids,
        )
    )
    rows = result.scalars().all()
    if len(rows) > 1:
        logger.warning("Duplicate quiz sessions for student %s and versions %s", student_id, doc_version_ids)
    return rows[0] if rows else None


async def _find_existing_summary(
    db: AsyncSession, student_id: UUID, doc_version_ids: list[UUID]
) -> Optional[Summary]:
    result = await db.execute(
        select(Summary).where(
            Summary.student_id == student_id,
            Summary.document_version_ids == doc_version_ids,
        )
    )
    rows = result.scalars().all()
    if len(rows) > 1:
        logger.warning("Duplicate summaries for student %s and versions %s", student_id, doc_version_ids)
    return rows[0] if rows else None


async def _find_existing_mindmap(
    db: AsyncSession, student_id: UUID, doc_version_ids: list[UUID]
) -> Optional[MindMap]:
    result = await db.execute(
        select(MindMap).where(
            MindMap.student_id == student_id,
            MindMap.document_version_ids == doc_version_ids,
        )
    )
    rows = result.scalars().all()
    if len(rows) > 1:
        logger.warning("Duplicate mindmaps for student %s and versions %s", student_id, doc_version_ids)
    return rows[0] if rows else None

# ----- Public API -----
async def generate_and_persist_flashcards(
    document_version_ids: list[UUID],
    num_cards: int,
    user: User,
    session: AsyncSession,
) -> FlashcardDeck:
    if num_cards < 1 or num_cards > 28:
        raise atlas_error("FLASHCARD_001", "Number of cards must be between 1 and 28.", status_code=400)

    # 🆔 Idempotency: return existing deck if already generated
    existing = await _find_existing_deck(session, user.id, document_version_ids)
    if existing:
        logger.info("Returning existing flashcard deck %s", existing.id)
        return existing

    doc_text = await _fetch_document_text(session, document_version_ids)
    full_prompt = (
        f"Document text:\n\n{doc_text}\n\n"
        f"Generate {num_cards} flashcards according to the given rules."
    )
    system_prompt = FLASHCARD_PROMPT.format(num_cards=num_cards)

    bridge = await _get_bridge()
    try:
        raw_response = await bridge.asset_generation_func(
            prompt=full_prompt,
            system_prompt=system_prompt,
            force_json=True,
        )
    except Exception as exc:
        logger.error("Flashcard generation call failed: %s", exc)
        raise RuntimeError("Upstream AI service is temporarily unavailable.") from exc

    cards_data = _safe_json_parse(raw_response)
    if not isinstance(cards_data, list):
        raise RuntimeError("Flashcard response is not a JSON array.")

    deck = FlashcardDeck(
        student_id=user.id,
        document_version_ids=document_version_ids,
        title="Generated Flashcards",
        card_count=len(cards_data),
    )
    session.add(deck)
    await session.flush()

    for card in cards_data:
        front = card.get("front", "").strip()
        back = card.get("back", "").strip()
        if not front or not back:
            continue
        fc = Flashcard(
            deck_id=deck.id,
            question=front,
            answer=back,
            difficulty="EASY",
            next_review_at=func.now(),
            interval=0,
            ease_factor=2.5,
            repetitions=0,
        )
        session.add(fc)

    await session.commit()
    await session.refresh(deck)
    return deck


async def generate_and_persist_quiz(
    document_version_ids: list[UUID],
    num_questions: int,
    user: User,
    session: AsyncSession,
) -> QuizSession:
    if num_questions < 1 or num_questions > 15:
        raise atlas_error("QUIZ_001", "Number of questions must be between 1 and 15.", status_code=400)

    existing = await _find_existing_quiz(session, user.id, document_version_ids)
    if existing:
        logger.info("Returning existing quiz %s", existing.id)
        return existing

    doc_text = await _fetch_document_text(session, document_version_ids)
    mcq_count = max(1, int(round(num_questions * 0.6)))
    written_count = num_questions - mcq_count

    full_prompt = (
        f"Document text:\n\n{doc_text}\n\n"
        f"Generate exactly {mcq_count} MCQs and {written_count} written questions."
    )
    system_prompt = QUIZ_PROMPT.format(mcq_count=mcq_count, written_count=written_count)

    bridge = await _get_bridge()
    try:
        raw_response = await bridge.asset_generation_func(
            prompt=full_prompt,
            system_prompt=system_prompt,
            force_json=True,
        )
    except Exception as exc:
        logger.error("Quiz generation call failed: %s", exc)
        raise RuntimeError("Upstream AI service is temporarily unavailable.") from exc

    data = _safe_json_parse(raw_response)
    mcq_list = data.get("mcq", [])
    written_list = data.get("written", [])

    quiz = QuizSession(
        student_id=user.id,
        document_version_ids=document_version_ids,
        total_questions=len(mcq_list) + len(written_list),
        time_limit_minutes=30,
    )
    session.add(quiz)
    await session.flush()

    for q in mcq_list:
        raw_opts = q.get("options", {})
        options_list = [{"key": k, "value": v} for k, v in raw_opts.items()] if isinstance(raw_opts, dict) else raw_opts
        question = Question(
            quiz_session_id=quiz.id,
            question_text=q["question"].strip(),
            question_type="mcq",
            options=options_list,
            correct_answer=q["answer"].strip().upper(),
            explanation=q.get("explanation", "").strip(),
        )
        session.add(question)

    for q in written_list:
        question = Question(
            quiz_session_id=quiz.id,
            question_text=q["question"].strip(),
            question_type="written",
            options=None,
            correct_answer=q.get("model_answer", "").strip(),
            explanation=None,
        )
        session.add(question)

    await session.commit()
    await session.refresh(quiz)
    return quiz


async def generate_and_persist_summary(
    document_version_ids: list[UUID],
    format_type: str,
    target_lang: str,
    user: User,
    session: AsyncSession,
) -> Summary:
    existing = await _find_existing_summary(session, user.id, document_version_ids)
    if existing:
        logger.info("Returning existing summary %s", existing.id)
        return existing

    doc_text = await _fetch_document_text(session, document_version_ids)
    full_prompt = (
        f"Document text:\n\n{doc_text}\n\n"
        f"Language: {target_lang}. Give the summary in {target_lang}."
    )
    bridge = await _get_bridge()
    try:
        raw_response = await bridge.asset_generation_func(
            prompt=full_prompt,
            system_prompt=SUMMARY_PROMPT,
            force_json=True,
        )
    except Exception as exc:
        logger.error("Summary generation call failed: %s", exc)
        raise RuntimeError("Upstream AI service is temporarily unavailable.") from exc

    data = _safe_json_parse(raw_response)
    summary = Summary(
        student_id=user.id,
        document_version_ids=document_version_ids,
        format=format_type,
        target_lang=target_lang,
        content=data,
    )
    session.add(summary)
    await session.commit()
    await session.refresh(summary)
    return summary


async def generate_and_persist_mindmap(
    document_version_ids: list[UUID],
    target_lang: str,
    user: User,
    session: AsyncSession,
) -> MindMap:
    existing = await _find_existing_mindmap(session, user.id, document_version_ids)
    if existing:
        logger.info("Returning existing mindmap %s", existing.id)
        return existing

    doc_text = await _fetch_document_text(session, document_version_ids)
    full_prompt = (
        f"Document text:\n\n{doc_text}\n\n"
        f"Language for mindmap labels: {target_lang}."
    )
    bridge = await _get_bridge()
    try:
        raw_response = await bridge.asset_generation_func(
            prompt=full_prompt,
            system_prompt=MINDMAP_PROMPT,
            force_json=False,
        )
    except Exception as exc:
        logger.error("Mindmap generation call failed: %s", exc)
        raise RuntimeError("Upstream AI service is temporarily unavailable.") from exc

    mindmap_syntax = _extract_mindmap_syntax(raw_response)
    mindmap = MindMap(
        student_id=user.id,
        document_version_ids=document_version_ids,
        target_lang=target_lang,
        title="Generated Mindmap",
        nodes_json=[{"type": "mermaid", "syntax": mindmap_syntax}],
        edges_json=[],
    )
    session.add(mindmap)
    await session.commit()
    await session.refresh(mindmap)
    return mindmap