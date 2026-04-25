import os
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.models.all_models import User, DocumentVersion, MindMap

logger = logging.getLogger(__name__)

# Global HTTP client for connection pooling.
http_client = httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=120.0, write=5.0, pool=10.0))

# Path to the shared prompts directory
PROMPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../prompts"))

def _load_prompt_template(filename: str, fallback_template: str) -> str:
    """Utility to load prompt templates from markdown files, with a hardcoded fallback."""
    filepath = os.path.join(PROMPTS_DIR, filename)
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        logger.warning(f"[PROMPTS] Template '{filename}' not found at {filepath}. Using hardcoded fallback.")
        return fallback_template

# =============================================================================
# SOTA LEGO ARCHITECTURE: HYBRID JSON CASCADE
# =============================================================================

async def _execute_ollama_json(prompt: str, model: str, max_tokens: int) -> Optional[Dict[str, Any]]:
    """Primary Engine: Executes against local Ollama, enforcing strict JSON output."""
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.3,
            "num_predict": max_tokens
        }
    }

    try:
        response = await http_client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        content = data.get("response", "")

        parsed_json = json.loads(content)
        return parsed_json

    except httpx.HTTPError as http_err:
        logger.warning(f"[GENERATION] HTTP network error with local model {model}: {http_err}")
        return None
    except json.JSONDecodeError as json_err:
        logger.warning(f"[GENERATION] Local model {model} failed to produce valid JSON: {json_err}")
        return None
    except Exception as e:
        logger.error(f"[GENERATION] Unexpected runtime error with local model {model}: {e}")
        return None

async def _execute_google_ai_json(prompt: str, max_tokens: int) -> Optional[Dict[str, Any]]:
    """Fallback Engine: Google AI Studio API integration."""
    api_key = os.getenv("GOOGLE_AI_API_KEY", "")
    fallback_model = os.getenv("GOOGLE_AI_FALLBACK_MODEL", "gemma-3-27b-it")

    if not api_key:
        logger.error("[GENERATION] GOOGLE_AI_API_KEY is missing. Cloud fallback aborted.")
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{fallback_model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}

    json_prompt = f"{prompt}\n\nIMPORTANT: You must respond with ONLY valid JSON. No markdown, no code blocks, just raw JSON."

    payload = {
        "contents": [{
            "role": "user",
            "parts": [{"text": json_prompt}]
        }],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json"
        }
    }

    try:
        response = await http_client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

        candidates = data.get("candidates", [])
        if candidates and candidates[0].get("content", {}).get("parts"):
            content = candidates[0]["content"]["parts"][0].get("text", "")
            return json.loads(content)
        return None
    except httpx.HTTPError as e:
        logger.error(f"[GENERATION] Google AI Studio HTTP error: {e}")
        return None
    except json.JSONDecodeError:
        logger.error("[GENERATION] Google AI Studio returned malformed JSON.")
        return None
    except Exception as e:
        logger.error(f"[GENERATION] Unexpected error during cloud fallback: {e}")
        return None

async def _call_llm_json(prompt: str, max_tokens: int = 4096) -> Optional[Dict[str, Any]]:
    """Unified LLM JSON caller with SOTA Cascade: Local Ollama -> Cloud Google AI."""
    primary_model = settings.OLLAMA_MODEL_GENERATION

    logger.info(f"[GENERATION] Attempting JSON generation via Primary Model (Local): {primary_model}")
    result = await _execute_ollama_json(prompt, primary_model, max_tokens)

    if result:
        return result

    logger.warning(f"[GENERATION] Primary Model ({primary_model}) failed. Routing to Cloud Fallback (Google AI Studio)...")
    result = await _execute_google_ai_json(prompt, max_tokens)

    if result:
        logger.info("[GENERATION] Cloud Fallback succeeded.")
        return result

    logger.error("[GENERATION] CRITICAL: Both Local and Cloud AI engines failed to generate valid JSON.")
    return None

# =============================================================================
# BUSINESS LOGIC PIPELINES
# =============================================================================

async def generate_quiz_from_text(text: str, num_questions: int = 5) -> List[Dict[str, Any]]:
    safe_text = text[:6000]

    fallback = """
    Based on the following academic text, generate a quiz with exactly {num_questions} multiple-choice questions.
    You MUST respond with a JSON object containing a single key "questions" holding an array of objects.
    Each object must have: "content", "options" (array of 4), "correct_answer", and "explanation".
    Text: {safe_text}
    """
    template = _load_prompt_template("quiz_basic_prompt.md", fallback)
    prompt = template.format(num_questions=num_questions, safe_text=safe_text)

    result = await _call_llm_json(prompt, max_tokens=2048)
    if result and "questions" in result:
        return result["questions"]
    return []


async def generate_exam_quiz(chunks: List[Dict[str, Any]], num_questions: int = 20) -> List[Dict[str, Any]]:
    context_text = ""
    for chunk in chunks:
        if len(context_text) > 80000: break
        context_text += f"\n--- PAGE {chunk.get('page', 'Unknown')} ---\n{chunk.get('text', '')}\n"

    fallback = """
    You are ATLAS, an elite academic evaluator. Based on the following source document pages, generate a comprehensive exam quiz with EXACTLY {num_questions} questions.
    REQUIREMENTS: Mix "MCQ", "TF", "FILL", "MATCH". Respond with JSON: {"questions": [{"question": "...", "question_type": "...", "options": [...], "correct_answer": "...", "explanation": "...", "source_page": 1}]}.
    SOURCE DOCUMENT:
    {context_text}
    """
    template = _load_prompt_template("exam_quiz_prompt.md", fallback)
    prompt = template.format(num_questions=num_questions, context_text=context_text)

    result = await _call_llm_json(prompt, max_tokens=8192)
    if result and "questions" in result:
        return result["questions"]
    return []


async def generate_feedback_for_missed_question(question: str, student_answer: str, correct_answer: str, source_text: str, source_page: int) -> str:
    fallback = """
    A student answered an academic quiz question incorrectly.
    Question: "{question}"
    Student's Answer: "{student_answer}"
    Correct Answer: "{correct_answer}"
    Source Text (Page {source_page}): "{source_text}"
    Generate a brief, targeted educational feedback string (max 2 sentences) in French. Output JSON {"feedback": "..."} starting with "Tu as confondu...". Do not include the source text quote.
    """
    template = _load_prompt_template("feedback_prompt.md", fallback)
    prompt = template.format(
        question=question,
        student_answer=student_answer,
        correct_answer=correct_answer,
        source_page=source_page,
        source_text=source_text
    )

    result = await _call_llm_json(prompt, max_tokens=512)
    base_feedback = "Tu as fait une erreur sur ce concept."
    if result and "feedback" in result:
        base_feedback = result["feedback"]

    chunk_preview = source_text[:150] + "..." if len(source_text) > 150 else source_text
    return f"{base_feedback} Voici le passage source : [{chunk_preview} - Page {source_page}]"


async def generate_mindmap_from_text(text: str, target_lang: str = "fr") -> Dict[str, List[Dict[str, Any]]]:
    safe_text = text[:15000]

    fallback = """
    Analyze the following academic text and extract a comprehensive concept map. Target Language: {target_lang}.
    Respond with JSON: {"nodes": [{"id": "1", "position": {"x": 250, "y": 0}, "data": {"label": "Concept", "source_extract": "Quote"}}], "edges": [{"id": "e1-2", "source": "1", "target": "2", "type": "smoothstep"}]}. Max 20 nodes.
    SOURCE TEXT:
    {safe_text}
    """
    template = _load_prompt_template("mindmap_prompt.md", fallback)
    prompt = template.format(target_lang=target_lang, safe_text=safe_text)

    result = await _call_llm_json(prompt, max_tokens=4096)
    if result and "nodes" in result and "edges" in result:
        return result
    return {"nodes": [], "edges": []}


async def generate_and_persist_mindmap(
    document_version_id: uuid.UUID,
    target_lang: str,
    user: User,
    session: AsyncSession
) -> Dict[str, Any]:
    """US-18: Orchestrates the AI generation and persists the resulting MindMap entity."""
    doc_query = await session.execute(select(DocumentVersion).where(DocumentVersion.id == document_version_id))
    doc = doc_query.scalars().first()

    if not doc or not getattr(doc, "ocr_text", None):
        raise ValueError("Document not found or has no extracted text ready for mapping.")

    graph_data = await generate_mindmap_from_text(doc.ocr_text, target_lang=target_lang)

    if not graph_data or not graph_data.get("nodes"):
        raise RuntimeError("Failed to generate a valid concept map from the document text.")

    mind_map = MindMap(
        student_id=user.id,
        document_version_id=doc.id,
        title=f"Concept Map - Document {str(doc.id)[:8]}",
        target_lang=target_lang,
        nodes_json=graph_data["nodes"],
        edges_json=graph_data["edges"]
    )

    session.add(mind_map)
    await session.commit()
    await session.refresh(mind_map)

    logger.info(f"[STUDY ENGINE] MindMap [{mind_map.id}] generated successfully for User [{user.id}].")

    return {
        "mindmap_id": mind_map.id,
        "title": mind_map.title,
        "target_lang": mind_map.target_lang,
        "nodes": mind_map.nodes_json,
        "edges": mind_map.edges_json
    }


async def generate_summary_from_text(
    text: str,
    format_type: str,
    target_lang: str = "fr",
    text_v2: Optional[str] = None
) -> Dict[str, Any]:
    safe_text = text[:15000]

    if format_type.upper() == "COMPARATIVE":
        if not text_v2:
            return {"error": "COMPARATIVE format requires text_v2 payload."}
        safe_text_v2 = text_v2[:15000]

        fallback = """
        Analyze the differences between Version 1 and Version 2 of the following academic texts. Target Language: {target_lang}.
        Output JSON: {"added": [], "removed": [], "modified": []}.
        Version 1: {safe_text} --- Version 2: {safe_text_v2}
        """
        template = _load_prompt_template("summary_comparative_prompt.md", fallback)
        prompt = template.format(target_lang=target_lang, safe_text=safe_text, safe_text_v2=safe_text_v2)

    elif format_type.upper() == "STRUCTURED":
        fallback = """
        Summarize the following academic text by extracting a detailed hierarchical plan. Target Language: {target_lang}.
        Output JSON: {"title": "Main Subject", "sections": [{"heading": "Title", "points": ["Pt 1"]}]}.
        Text: {safe_text}
        """
        template = _load_prompt_template("summary_structured_prompt.md", fallback)
        prompt = template.format(target_lang=target_lang, safe_text=safe_text)

    else: # EXECUTIVE
        fallback = """
        Provide an executive summary of the following academic text using EXACTLY 5 high-impact bullet points. Target Language: {target_lang}.
        Output JSON: {"bullets": ["Pt 1", "Pt 2", "Pt 3", "Pt 4", "Pt 5"]}.
        Text: {safe_text}
        """
        template = _load_prompt_template("summary_executive_prompt.md", fallback)
        prompt = template.format(target_lang=target_lang, safe_text=safe_text)

    result = await _call_llm_json(prompt, max_tokens=2048)
    if result:
        return result
    return {"error": f"Failed to generate {format_type} summary."}