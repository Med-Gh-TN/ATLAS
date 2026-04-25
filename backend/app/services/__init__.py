"""
ATLAS Core Services Master Facade.

This is the root of the domain-driven service layer.

DEFENSIVE ARCHITECTURE ENFORCEMENT:
To strictly enforce bounded contexts, prevent circular dependencies, and minimize
memory footprint during Celery worker forks, individual domain functions and classes
are DELIBERATELY NOT hoisted to this root level.

Cross-domain communication must explicitly address the target domain boundary.
Example: `from app.services.study_engine import generate_flashcards_from_text`
"""

__all__ = []
