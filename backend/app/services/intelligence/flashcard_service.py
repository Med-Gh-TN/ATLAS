"""
@file backend/app/services/intelligence/flashcard_service.py
@description Service handling SuperMemo-2 (SM2) spaced repetition logic and review mappings.
@layer Core Logic
@dependencies None
"""

from enum import Enum


class ReviewButton(str, Enum):
    AGAIN = "AGAIN"
    HARD = "HARD"
    GOOD = "GOOD"
    EASY = "EASY"


def map_button_to_quality(button: ReviewButton) -> int:
    """
    Maps user feedback buttons to SM-2 quality scores (0-5).
    0 = Complete blackout / forgotten.
    3 = Correct response recalled with serious difficulty.
    4 = Perfect response, after a hesitation.
    5 = Perfect response.
    """
    mapping = {
        ReviewButton.AGAIN: 0,
        ReviewButton.HARD: 3,
        ReviewButton.GOOD: 4,
        ReviewButton.EASY: 5,
    }
    return mapping.get(button, 0)


def calculate_sm2(
    quality: int, repetitions: int, ease_factor: float, interval: int
) -> tuple[int, float, int]:
    """
    Calculates the next review interval using the SuperMemo-2 (SM-2) algorithm.
    
    Args:
        quality: 0-5 rating of recall quality.
        repetitions: How many times the card has been successfully recalled in a row.
        ease_factor: Multiplier for interval growth (default usually 2.5).
        interval: Current interval in days.
        
    Returns:
        tuple[int, float, int]: (new_repetitions, new_ease_factor, new_interval)
    """
    if quality >= 3:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease_factor)
        repetitions += 1
    else:
        repetitions = 0
        interval = 1

    # Calculate new ease factor
    ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    
    # Floor the ease factor at 1.3
    if ease_factor < 1.3:
        ease_factor = 1.3

    return repetitions, ease_factor, interval