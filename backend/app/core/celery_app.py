import logging
from celery import Celery
from app.core.config import settings

logger = logging.getLogger(__name__)

# DEFENSIVE ARCHITECTURE: Explicitly define all task modules for auto-discovery.
# If a task module is not listed here, Celery will raise a NotRegistered error at runtime.
celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    include=[
        # ARCHITECT FIX: Mapped tasks to their strict domain boundaries
        "app.services.doc_processing.ocr_tasks",
        "app.services.ai_core.embedding_tasks",
        "app.services.study_engine.flashcard_tasks"
    ]
)

# Apply production-ready and defensive configurations
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone enforcement
    timezone="UTC",
    enable_utc=True,

    # Backend storage (Strictly Redis as per US-01)
    result_backend=settings.CELERY_RESULT_BACKEND,

    # ==========================================
    # DEFENSIVE CONFIGURATIONS
    # ==========================================
    # Prevent memory leaks by restarting the worker process after 1000 tasks
    worker_max_tasks_per_child=1000,

    # Ensure fair distribution of heavy AI tasks (OCR/Embeddings) across multiple workers
    # A multiplier of 1 prevents a single worker from hoarding all heavy tasks
    worker_prefetch_multiplier=1,

    # Task time limits to prevent hanging processes
    task_acks_late=True,

    # OLLAMA SPECIFIC DEFENSES:
    # Hard bounds to prevent zombie workers if the vision or generation model hangs indefinitely.
    # We add a buffer to the Ollama timeout for network and serialization overhead.
    task_soft_time_limit=settings.OLLAMA_TIMEOUT_SECONDS + 15,
    task_time_limit=settings.OLLAMA_TIMEOUT_SECONDS + 30,
)

logger.info("Celery Application configured with strict timeouts and model fallback environment.")