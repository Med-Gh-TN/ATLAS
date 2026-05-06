"""
Query Classifier - Phase 4
Routes queries to optimal retrieval mode based on intent.
"""

import os
import logging
import json
from typing import Literal

import httpx

logger = logging.getLogger(__name__)

QueryMode = Literal["vector", "hybrid", "graph"]


class QueryClassifier:
    """
    ATLAS-OCR-new style query routing.
    Uses LLM to classify intent: exact lookup vs. conceptual exploration.
    """

    SYSTEM_PROMPT = """You are a Query Intent Classifier for an academic document retrieval system.

Analyze the user's question and classify it into one of three categories:

1. VECTOR - Use for:
   - Exact code snippets, equations, formulas
   - Specific technical terms or definitions
   - "Find the exact text about..."
   - Programming syntax, mathematical expressions

2. HYBRID - Use for:
   - Broad conceptual questions
   - Summaries, explanations, relationships
   - "Explain the concept of..."
   - Connections between ideas

3. GRAPH - Use for:
   - Questions about document structure
   - Cross-references between sections
   - "What relates to..."

Respond with ONLY a JSON object: {"mode": "vector" | "hybrid" | "graph", "confidence": 0.0-1.0}
"""

    def __init__(self):
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = os.getenv("CLASSIFIER_MODEL", "gemma2:2b")

    async def classify(self, query: str) -> QueryMode:
        """
        Classifies query intent.
        Returns: "vector", "hybrid", or "graph"
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "system": self.SYSTEM_PROMPT,
                        "prompt": f"Query: {query}\n\nClassification:",
                        "stream": False,
                        "format": "json",
                    },
                    timeout=5.0,
                )

                result = response.json()
                raw_response = result.get("response", "{}")

                try:
                    classification = json.loads(raw_response)
                    mode = classification.get("mode", "hybrid")
                    confidence = classification.get("confidence", 0.5)

                    logger.info(
                        f"[CLASSIFIER] Query classified: {mode} (confidence: {confidence:.2f})"
                    )

                    if mode in ["vector", "hybrid", "graph"]:
                        return mode

                except json.JSONDecodeError:
                    logger.warning(f"[CLASSIFIER] Failed to parse response: {raw_response}")

        except Exception as e:
            logger.error(f"[CLASSIFIER] Classification failed: {e}")

        return "hybrid"


_classifier: QueryClassifier = None


async def get_query_classifier() -> QueryClassifier:
    global _classifier
    if _classifier is None:
        _classifier = QueryClassifier()
    return _classifier
