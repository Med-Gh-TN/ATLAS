import json
import logging
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
from enum import Enum
import httpx
from pydantic import BaseModel, Field, ValidationError

# Importing the Enum from models to ensure domain consistency
from app.models.study_tools import DifficultyLevel

logger = logging.getLogger(__name__)

# --- PYDANTIC SCHEMAS FOR STRICT LLM OUTPUT VALIDATION ---

class GeneratedFlashcard(BaseModel):
    question: str = Field(..., description="The highly specific flashcard question.")
    answer: str = Field(..., description="The concise, accurate answer.")
    difficulty: DifficultyLevel = Field(
        ..., 
        description="EASY (definition), MEDIUM (application/example), or HARD (critical analysis)."
    )

class FlashcardDeckGeneration(BaseModel):
    flashcards: List[GeneratedFlashcard]

# --- SM-2 SPACED REPETITION ENGINE ---

class ReviewButton(str, Enum):
    """Anki-style review buttons for the frontend."""
    AGAIN = "AGAIN"
    HARD = "HARD"
    GOOD = "GOOD"
    EASY = "EASY"

def map_button_to_quality(button: ReviewButton) -> int:
    """
    Maps frontend Anki-style buttons to the SM-2 0-5 quality scale.
    """
    mapping = {
        ReviewButton.AGAIN: 0,  # Complete blackout / Incorrect
        ReviewButton.HARD: 2,   # Correct but with significant hesitation/difficulty
        ReviewButton.GOOD: 4,   # Correct response after hesitation
        ReviewButton.EASY: 5    # Perfect, immediate recall
    }
    return mapping.get(button, 4)

def calculate_sm2(quality: int, repetitions: int, ease_factor: float, interval: int) -> Tuple[int, float, int]:
    """
    SuperMemo-2 (SM-2) Spaced Repetition Algorithm with strict mathematical boundaries.
    
    Parameters:
    - quality: 0-5 scale (0 = complete blackout, 5 = perfect recall)
    - repetitions: number of times the card has been successfully reviewed in a row
    - ease_factor: multiplier for the review interval (default 2.5)
    - interval: current interval in days
    
    Returns:
    - Tuple: (new_repetitions, new_ease_factor, new_interval_days)
    """
    # Defensive programming: Enforce strict boundaries
    quality = max(0, min(5, quality))
    repetitions = max(0, repetitions)
    ease_factor = max(1.3, ease_factor)
    interval = max(0, interval)

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
            new_interval = max(1, round(interval * ease_factor))
        new_repetitions = repetitions + 1

    # Calculate new ease factor
    new_ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    
    # Ease factor cannot drop below 1.3 to prevent interval stagnation
    new_ease_factor = max(1.3, new_ease_factor)

    return new_repetitions, new_ease_factor, new_interval


# --- AI GENERATION PIPELINE ---

async def generate_flashcards_from_text(text: str, num_cards: int = 5) -> List[Dict[str, Any]]:
    """
    Uses an LLM to extract key academic concepts and formulate Question/Answer pairs.
    Enforces a strict Pydantic JSON output to integrate cleanly with the database.
    """
    # Truncate text to roughly 4000 characters to stay within safe token limits
    safe_text = text[:4000]
    
    prompt = f"""
    Analyze the following academic text and generate exactly {num_cards} flashcards.
    
    REQUIREMENTS:
    1. Distribute difficulty: Extract definitions (EASY), application/examples (MEDIUM), and critical analysis (HARD).
    2. You MUST respond with a valid, raw JSON object matching this exact schema:
       {{
         "flashcards": [
           {{
             "question": "string",
             "answer": "string",
             "difficulty": "EASY" | "MEDIUM" | "HARD"
           }}
         ]
       }}
    
    Do NOT wrap the response in markdown formatting (no ```json). Output raw JSON only.
    
    Text:
    {safe_text}
    """

    messages = [
        {"role": "system", "content": "You are an elite academic architect. Output strict, valid JSON matching the exact schema provided."},
        {"role": "user", "content": prompt}
    ]

    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        logger.error("CRITICAL: GROQ_API_KEY environment variable is missing. Flashcard generation aborted.")
        return []

    url = "[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "mixtral-8x7b-32768",
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            
            content = data["choices"][0]["message"]["content"]
            parsed_json = json.loads(content)
            
            # Strict Pydantic Validation Boundary
            validated_deck = FlashcardDeckGeneration(**parsed_json)
            
            logger.info(f"Successfully generated and validated {len(validated_deck.flashcards)} flashcards via AI.")
            
            # Return dicts for easy SQLModel insertion downstream (Pydantic V2 syntax)
            return [card.model_dump() for card in validated_deck.flashcards]
            
    except httpx.HTTPStatusError as http_err:
        logger.error(f"Upstream API Error during flashcard generation: {http_err.response.text}")
        return []
    except ValidationError as val_err:
        logger.error(f"LLM JSON Output failed strict Pydantic validation: {val_err}")
        return []
    except json.JSONDecodeError as json_err:
        logger.error(f"LLM failed to output valid JSON formatting: {json_err}")
        return []
    except Exception as e:
        logger.exception(f"Unexpected architectural failure during flashcard generation: {e}")
        return []