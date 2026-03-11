import json
import logging
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
import httpx

logger = logging.getLogger(__name__)

def calculate_sm2(quality: int, repetitions: int, ease_factor: float, interval: int) -> Tuple[int, float, int]:
    """
    SuperMemo-2 (SM-2) Spaced Repetition Algorithm.
    
    Parameters:
    - quality: 0-5 scale (0 = complete blackout, 5 = perfect recall)
    - repetitions: number of times the card has been successfully reviewed in a row
    - ease_factor: multiplier for the review interval (default 2.5)
    - interval: current interval in days
    
    Returns:
    - Tuple: (new_repetitions, new_ease_factor, new_interval_days)
    """
    # If the user failed to recall (quality < 3)
    if quality < 3:
        new_repetitions = 0
        new_interval = 1
    else:
        # If the user successfully recalled
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)
        new_repetitions = repetitions + 1

    # Calculate new ease factor
    new_ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    
    # Ease factor cannot drop below 1.3
    if new_ease_factor < 1.3:
        new_ease_factor = 1.3

    return new_repetitions, new_ease_factor, new_interval


async def generate_flashcards_from_text(text: str, num_cards: int = 5) -> List[Dict[str, str]]:
    """
    Uses an LLM to extract key academic concepts and formulate Question/Answer pairs.
    Enforces a strict JSON output to integrate cleanly with the database.
    Primary route: Groq (Mixtral 8x7b) for speed and cheap structured output.
    """
    # Truncate text to roughly 4000 characters to stay within safe token limits for fast extraction
    safe_text = text[:4000]
    
    prompt = f"""
    Analyze the following academic text and generate exactly {num_cards} flashcards.
    Extract the most critical definitions, formulas, or concepts.
    
    You MUST respond with a raw JSON object containing a single key "flashcards" 
    which holds an array of objects. Each object must have "question" and "answer" keys.
    Do NOT wrap the response in markdown formatting like ```json.
    
    Text:
    {safe_text}
    """

    messages = [
        {"role": "system", "content": "You are an expert academic tutor. Output valid, raw JSON only."},
        {"role": "user", "content": prompt}
    ]

    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        logger.error("GROQ_API_KEY is not set. Cannot generate flashcards.")
        return []

    url = "[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # We use response_format type json_object to force deterministic JSON
    payload = {
        "model": "mixtral-8x7b-32768",
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            
            content = data["choices"][0]["message"]["content"]
            parsed_json = json.loads(content)
            
            # Robust extraction of the array
            if "flashcards" in parsed_json and isinstance(parsed_json["flashcards"], list):
                return parsed_json["flashcards"]
            
            # Fallback if the LLM named the key something else
            for key, value in parsed_json.items():
                if isinstance(value, list):
                    return value
                    
            return []
            
    except Exception as e:
        logger.error(f"Flashcard generation failed: {e}")
        return []