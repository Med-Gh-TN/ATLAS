from __future__ import annotations


def calculate_sm2(quality: int, repetitions: int, ease_factor: float, interval: int) -> tuple[int, float, int]:
    quality = max(0, min(5, quality))
    repetitions = max(0, repetitions)
    ease_factor = max(1.3, ease_factor)
    interval = max(0, interval)

    if quality < 3:
        new_repetitions = 0
        new_interval = 1
    else:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = max(1, round(interval * ease_factor))
        new_repetitions = repetitions + 1

    new_ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ease_factor = max(1.3, new_ease_factor)

    return new_repetitions, new_ease_factor, new_interval


__all__ = ["calculate_sm2"]
