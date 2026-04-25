import logging
import time
import httpx
from typing import List, Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class OllamaInferenceError(Exception):
    """Custom exception raised when Ollama fails to respond after maximum retries."""
    pass

class OllamaClient:
    """
    SOTA Modular HTTP Client for Ollama.
    Strictly decoupled from business logic to act as a "Lego" engine.
    Handles both standard text generation and multimodal (vision) payloads.
    """

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.timeout = settings.OLLAMA_TIMEOUT_SECONDS
        self.max_retries = settings.OLLAMA_MAX_RETRIES

        # DEFENSIVE ARCHITECTURE: Enforce strict connection pooling limits
        # Prevents port exhaustion during high-concurrency Celery OCR bursts.
        self.client_limits = httpx.Limits(max_keepalive_connections=5, max_connections=20)

    def _post_with_retries(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Internal execution engine with exponential backoff and strict timeout adherence.
        """
        url = f"{self.base_url}{endpoint}"
        attempt = 0
        last_exception = None

        # httpx Client context ensures connections are properly recycled
        with httpx.Client(timeout=self.timeout, limits=self.client_limits) as client:
            while attempt < self.max_retries:
                try:
                    logger.info(f"[OLLAMA] Dispatching payload to {payload.get('model')} (Attempt {attempt + 1}/{self.max_retries})")

                    response = client.post(url, json=payload)
                    response.raise_for_status()

                    logger.info(f"[OLLAMA] Successful inference from {payload.get('model')}")
                    return response.json()

                except httpx.TimeoutException as e:
                    logger.warning(f"[OLLAMA] Timeout on attempt {attempt + 1}: {str(e)}")
                    last_exception = e
                except httpx.HTTPStatusError as e:
                    logger.error(f"[OLLAMA] HTTP Error {e.response.status_code}: {e.response.text}")
                    last_exception = e
                    # Fast-fail on 4xx errors (e.g., model not found), as retrying won't fix bad requests
                    if 400 <= e.response.status_code < 500:
                        break
                except httpx.RequestError as e:
                    logger.warning(f"[OLLAMA] Network disruption on attempt {attempt + 1}: {str(e)}")
                    last_exception = e

                attempt += 1
                if attempt < self.max_retries:
                    backoff_time = 2 ** attempt  # Exponential backoff: 2s, 4s, 8s...
                    logger.debug(f"[OLLAMA] Sleeping for {backoff_time}s before retry...")
                    time.sleep(backoff_time)

        # Total failure threshold reached
        error_msg = f"Ollama API completely failed after {self.max_retries} attempts. Last exception: {str(last_exception)}"
        logger.critical(error_msg)
        raise OllamaInferenceError(error_msg)

    def generate_text(self, prompt: str, model: Optional[str] = None, system: Optional[str] = None) -> str:
        """
        Standard text generation pipeline.
        Defaults to settings.OLLAMA_MODEL_RAG (e.g., qwen) if no model is explicitly passed.
        """
        target_model = model or settings.OLLAMA_MODEL_RAG

        payload = {
            "model": target_model,
            "prompt": prompt,
            "stream": False
        }
        if system:
            payload["system"] = system

        response_data = self._post_with_retries("/api/generate", payload)
        return response_data.get("response", "")

    def generate_vision(self, prompt: str, base64_images: List[str], model: Optional[str] = None) -> str:
        """
        Multimodal OCR pipeline.
        Defaults to settings.OLLAMA_MODEL_VISION (e.g., minicpm-v4).
        """
        target_model = model or settings.OLLAMA_MODEL_VISION

        # Defensive Input Validation
        if not base64_images or not isinstance(base64_images, list):
            raise ValueError("CRITICAL: Vision model requires a valid list of base64 encoded images.")

        payload = {
            "model": target_model,
            "prompt": prompt,
            "images": base64_images,
            "stream": False
        }

        response_data = self._post_with_retries("/api/generate", payload)
        return response_data.get("response", "")

# Instantiate the singleton for application-wide use
ollama = OllamaClient()