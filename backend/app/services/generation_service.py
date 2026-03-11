import json
import logging
import os
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

async def _call_llm_json(prompt: str, max_tokens: int = 2048) -> Optional[Dict[str, Any]]:
    """
    Internal helper to call Groq API and strictly parse JSON output.
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
        {"role": "system", "content": "You are ATLAS, an expert academic AI. You must output only valid, raw JSON without any markdown wrapping (e.g., do not use ```json)."},
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
        async with httpx.AsyncClient(timeout=20.0) as client:
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
    Generates a Multiple Choice Question (MCQ) quiz based on the provided academic text.
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
    
    result = await _call_llm_json(prompt)
    if result and "questions" in result:
        return result["questions"]
    return []


async def generate_mindmap_from_text(text: str) -> Dict[str, List[Dict[str, Any]]]:
    """
    Extracts key concepts and relationships to form a graph/mind-map.
    """
    safe_text = text[:6000]
    
    prompt = f"""
    Analyze the following text and extract a concept map.
    
    You MUST respond with a JSON object containing two keys: "nodes" and "edges".
    - "nodes": an array of objects with "id" (string) and "label" (string representing the concept).
    - "edges": an array of objects with "source" (node id), "target" (node id), and "label" (relationship type).
    Keep the map concise (max 15 nodes).
    
    Text:
    {safe_text}
    """
    
    result = await _call_llm_json(prompt)
    if result and "nodes" in result and "edges" in result:
        return result
    return {"nodes": [], "edges": []}


async def generate_summary_from_text(text: str, format_type: str, target_lang: str) -> Dict[str, Any]:
    """
    Generates a structured summary based on user preference and language.
    """
    safe_text = text[:6000]
    
    prompt = f"""
    Summarize the following academic text. 
    Format required: {format_type} (e.g., EXECUTIVE means 5 bullet points, STRUCTURED means hierarchical plan).
    Target Language: {target_lang}.
    
    You MUST respond with a JSON object containing a single key "summary" which holds the formatted text.
    
    Text:
    {safe_text}
    """
    
    result = await _call_llm_json(prompt)
    if result and "summary" in result:
        return result
    return {"summary": "Failed to generate summary."}