"""
Study Engine Domain Public API.

This module exposes the strict public interface for the student learning tools,
including AI generation (flashcards, quizzes, summaries, mindmaps), spaced
repetition logic, gamification state management, and dashboard data aggregation.
"""

from .flashcard_service import (
    generate_flashcards_from_text,
    calculate_sm2,
    map_button_to_quality,
    ReviewButton,
)
from .flashcard_tasks import generate_flashcards_task
from .generation_service import (
    generate_quiz_from_text,
    generate_exam_quiz,
    generate_feedback_for_missed_question,
    generate_and_persist_mindmap,
    generate_summary_from_text,
)
from .quiz_service import (
    QuizEvaluationEngine,
    QuizSubmitPayload,
    AnswerSubmission,
)
from .gamification_service import (
    get_total_xp,
    get_level_for_xp,
    award_badges_for_user,
    ensure_default_badges,
)
from .dashboard_service import (
    fetch_student_dashboard_data,
    generate_student_calendar_ics,
)

__all__ = [
    # Flashcards & Spaced Repetition
    "generate_flashcards_from_text",
    "calculate_sm2",
    "map_button_to_quality",
    "ReviewButton",
    "generate_flashcards_task",

    # AI Generation Suite (Quizzes, MindMaps, Summaries)
    "generate_quiz_from_text",
    "generate_exam_quiz",
    "generate_feedback_for_missed_question",
    "generate_and_persist_mindmap",
    "generate_summary_from_text",

    # Quiz Evaluation Engine
    "QuizEvaluationEngine",
    "QuizSubmitPayload",
    "AnswerSubmission",

    # Gamification
    "get_total_xp",
    "get_level_for_xp",
    "award_badges_for_user",
    "ensure_default_badges",

    # Dashboards & Exports
    "fetch_student_dashboard_data",
    "generate_student_calendar_ics",
]