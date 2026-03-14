import json
import logging
import os
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

async def _call_llm_json(prompt: str, max_tokens: int = 4096) -> Optional[Dict[str, Any]]:
    """
    Internal helper to call Groq API and strictly parse JSON output.
    Increased max_tokens for high-capacity exam generation (US-17) and heavy MindMaps (US-18).
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        logger.error("GROQ_API_KEY is not set.")
        return None

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    messages = [
        {
            "role": "system", 
            "content": "You are ATLAS, an expert academic AI. You must output only valid, raw JSON without any markdown wrapping (e.g., do not use ```json)."
        },
        {"role": "user", "content": prompt}
    ]

    payload = {
        "model": "mixtral-8x7b-32768",
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "max_tokens": max_tokens
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client: # Increased timeout for heavy generation tasks
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
    except Exception as e:
        logger.error(f"LLM JSON generation failed: {e}")
        return None


async def generate_quiz_from_text(text: str, num_questions: int = 5) -> List[Dict[str, Any]]:
    """
    Legacy method: Generates a basic Multiple Choice Question (MCQ) quiz.
    Retained for backward compatibility with quick-tests.
    """
    safe_text = text[:6000] # Safe context window limit
    
    prompt = f"""
    Based on the following academic text, generate a quiz with exactly {num_questions} multiple-choice questions.
    
    You MUST respond with a JSON object containing a single key "questions" holding an array of objects.
    Each object must have:
    - "content": the question text
    - "options": an array of 4 possible answers
    - "correct_answer": the exact string of the correct option
    - "explanation": a brief explanation of why it is correct
    
    Text:
    {safe_text}
    """
    
    result = await _call_llm_json(prompt, max_tokens=2048)
    if result and "questions" in result:
        return result["questions"]
    return []


async def generate_exam_quiz(chunks: List[Dict[str, Any]], num_questions: int = 20) -> List[Dict[str, Any]]:
    """
    US-17: Generates a comprehensive simulation exam based on document chunks.
    Requires chunks in the format: [{"page": int, "text": str}]
    """
    # Compile text safely with page markers to ensure accurate source_page mapping
    context_text = ""
    for chunk in chunks:
        # Prevent context window overflow
        if len(context_text) > 80000:
            break
        context_text += f"\n--- PAGE {chunk.get('page', 'Unknown')} ---\n{chunk.get('text', '')}\n"

    prompt = f"""
    You are ATLAS, an elite academic evaluator. Based on the following source document pages, generate a comprehensive exam quiz with EXACTLY {num_questions} questions.

    REQUIREMENTS:
    1. Mix the following question types evenly: "MCQ" (Multiple Choice), "TF" (True/False), "FILL" (Texte à trous using [___]), "MATCH" (Correspondance).
    2. Ensure questions are valid, unambiguous, and directly based on the provided text.
    3. You MUST respond with a JSON object containing a single key "questions" holding an array of {num_questions} objects.

    JSON SCHEMA FOR EACH QUESTION:
    {{
        "question": "The question text. For FILL, include [___].",
        "question_type": "MCQ" | "TF" | "FILL" | "MATCH",
        "options": ["A", "B", "C", "D"], // Minimum 2 for TF, 4 for MCQ/MATCH. For FILL, provide plausible distractors including the correct answer.
        "correct_answer": "The exact string from options that is correct.",
        "explanation": "Brief explanation of the answer.",
        "source_page": <Integer representing the source PAGE number>
    }}

    SOURCE DOCUMENT:
    {context_text}
    """

    result = await _call_llm_json(prompt, max_tokens=8192)
    if result and "questions" in result:
        return result["questions"]
    return []


async def generate_feedback_for_missed_question(question: str, student_answer: str, correct_answer: str, source_text: str, source_page: int) -> str:
    """
    US-17: Generates targeted AI feedback for a missed question.
    Calculates the exact point of confusion and appends the source passage.
    """
    prompt = f"""
    A student answered an academic quiz question incorrectly.
    Question: "{question}"
    Student's Answer: "{student_answer}"
    Correct Answer: "{correct_answer}"
    Source Text (Page {source_page}): "{source_text}"

    Generate a brief, targeted educational feedback string (max 2 sentences) in French.
    You MUST output a JSON object with a single key "feedback".
    The feedback should start by diagnosing the confusion: "Tu as confondu [their concept] avec [the correct concept]." 
    Then briefly state why the correct answer is true based on the text. Do not include the source text quote in your JSON.
    """
    
    result = await _call_llm_json(prompt, max_tokens=512)
    base_feedback = "Tu as fait une erreur sur ce concept."
    
    if result and "feedback" in result:
        base_feedback = result["feedback"]
        
    # Strictly formatting the output as requested by the US-17 backlog
    chunk_preview = source_text[:150] + "..." if len(source_text) > 150 else source_text
    final_feedback = f"{base_feedback} Voici le passage source : [{chunk_preview} - Page {source_page}]"
    
    return final_feedback


async def generate_mindmap_from_text(text: str, target_lang: str = "fr") -> Dict[str, List[Dict[str, Any]]]:
    """
    US-18: Extracts key concepts mapped strictly to React Flow requirements.
    Translates output to target_lang. Provides source extracts for node clicking.
    """
    safe_text = text[:15000] # Allow larger context for accurate mapping
    
    prompt = f"""
    Analyze the following academic text and extract a comprehensive concept map.
    Target Language for all output text: {target_lang}.
    
    You MUST respond with a perfectly valid JSON object containing two keys: "nodes" and "edges".
    This JSON will be directly injected into a React Flow renderer.
    
    SCHEMA REQUIREMENTS:
    1. "nodes": Array of objects. Max 20 nodes.
       - "id": string (unique, e.g., "1", "2").
       - "position": object {{"x": integer, "y": integer}} (Arrange them hierarchically. Root node at x: 250, y: 0. Children spread logically).
       - "data": object containing:
           - "label": string (The core concept in {target_lang}).
           - "source_extract": string (A direct, 1-2 sentence quote from the text that explains this node. Used for user click-to-read).
    2. "edges": Array of objects.
       - "id": string (e.g., "e1-2").
       - "source": string (Parent node id).
       - "target": string (Child node id).
       - "label": string (Brief relationship description in {target_lang}, optional).
       - "type": "smoothstep" (Strictly this string).
    
    SOURCE TEXT:
    {safe_text}
    """
    
    result = await _call_llm_json(prompt, max_tokens=4096)
    if result and "nodes" in result and "edges" in result:
        return result
    return {"nodes": [], "edges": []}


async def generate_summary_from_text(
    text: str, 
    format_type: str, 
    target_lang: str = "fr",
    text_v2: Optional[str] = None
) -> Dict[str, Any]:
    """
    US-18: Generates a summary tailored to 3 specific formats and a target language.
    Handles EXECUTIVE (5 bullets), STRUCTURED (Hierarchical), COMPARATIVE (Diff).
    """
    safe_text = text[:15000]
    
    if format_type.upper() == "COMPARATIVE":
        if not text_v2:
            return {"error": "COMPARATIVE format requires text_v2 payload."}
        safe_text_v2 = text_v2[:15000]
        prompt = f"""
        Analyze the differences between Version 1 and Version 2 of the following academic texts.
        Target Language: {target_lang}.
        
        You MUST output a JSON object representing the comparative diff:
        {{
            "added": ["List of new key concepts in Version 2"],
            "removed": ["List of concepts from Version 1 missing in Version 2"],
            "modified": ["List of concepts that changed meaning or context"]
        }}
        
        Version 1: {safe_text}
        ---
        Version 2: {safe_text_v2}
        """
    elif format_type.upper() == "STRUCTURED":
        prompt = f"""
        Summarize the following academic text by extracting a detailed hierarchical plan.
        Target Language: {target_lang}.
        
        You MUST output a JSON object:
        {{
            "title": "Main Subject",
            "sections": [
                {{
                    "heading": "Section Title",
                    "points": ["Point 1", "Point 2"]
                }}
            ]
        }}
        
        Text: {safe_text}
        """
    else: # Default to EXECUTIVE
        prompt = f"""
        Provide an executive summary of the following academic text using EXACTLY 5 high-impact bullet points.
        Target Language: {target_lang}.
        
        You MUST output a JSON object:
        {{
            "bullets": [
                "Point 1",
                "Point 2",
                "Point 3",
                "Point 4",
                "Point 5"
            ]
        }}
        
        Text: {safe_text}
        """
    
    result = await _call_llm_json(prompt, max_tokens=2048)
    if result:
        return result
    return {"error": f"Failed to generate {format_type} summary."}