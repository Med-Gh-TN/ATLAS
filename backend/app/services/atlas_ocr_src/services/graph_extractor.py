"""
src/services/graph_extractor.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: SOTA Knowledge Graph Extraction Service (v6.4 Few-Shot Calibrated)
════════════════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
import asyncio
from typing import List, Dict, Any

from neo4j import AsyncGraphDatabase
from pydantic import ValidationError

from app.services.atlas_ocr_src.infrastructure.llm.bridge import OmniModelBridge
from app.services.atlas_ocr_src.domain.models import GraphExtractionResult, GraphNode, GraphRelationship

logger = logging.getLogger(__name__)

class GraphExtractionService:
    def __init__(self, bridge: OmniModelBridge, semaphore: asyncio.Semaphore):
        self.bridge = bridge
        self.semaphore = semaphore
        self._driver = None
        self._connected = False
        self._init_neo4j()

    def _init_neo4j(self) -> None:
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USERNAME", "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "")
        if not password: return
        try:
            self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
            self._connected = True
        except Exception as e:
            logger.error(f"[GraphExtractor] Failed to connect to Neo4j: {e}")

    async def extract_and_upsert(self, chunks: List[Dict[str, Any]], doc_uuid: str) -> None:
        if not self._connected or not self._driver: return

        all_nodes = []
        all_relationships = []

        for i, chunk in enumerate(chunks):
            text_content = chunk.get("content", "")
            if not text_content or len(text_content) < 50: continue

            try:
                extraction = await self._extract_from_llm(text_content)
                if extraction:
                    all_nodes.extend([n.model_dump() for n in extraction.nodes])
                    all_relationships.extend([r.model_dump() for r in extraction.relationships])
            except Exception as e:
                logger.error(f"[GraphExtractor] LLM extraction failed on chunk: {e}")

        if all_nodes:
            await self._upsert_to_neo4j(all_nodes, all_relationships, doc_uuid)

    async def _extract_from_llm(self, text: str) -> GraphExtractionResult | None:
        # [SOTA UPGRADE] Few-Shot Learning injected here to calibrate the Lite model
        system_prompt = """You are an elite Knowledge Graph Extractor.
Extract structural entities and relationships from the provided text chunk.

ALLOWED NODE TYPES: "Technology", "Standard", "SyntaxElement", "Concept", "Tool", "Language"
ALLOWED RELATIONSHIP TYPES: "USED_FOR", "VALIDATES", "CONTAINS", "SUCCESSOR_TO", "DEFINES", "DEPENDS_ON", "IMPLEMENTS"

CRITICAL: The "id" MUST be 1-3 words maximum (e.g., "XML", "DTD", "HTML"). NEVER put a full sentence in the "id".

EXAMPLE INPUT:
"XML (eXtensible Markup Language) is a format for storing data. It uses a DTD (Document Type Definition) to validate its structure."

EXAMPLE OUTPUT:
{
  "nodes": [
    {"id": "XML", "type": "Technology", "description": "eXtensible Markup Language, a format for storing and exchanging data."},
    {"id": "DTD", "type": "Standard", "description": "Document Type Definition, a method for validating XML structure."}
  ],
  "relationships": [
    {"source_id": "DTD", "target_id": "XML", "type": "VALIDATES", "explanation": "DTD is used to validate the structure of an XML document."}
  ]
}

You MUST return a raw, valid JSON object matching this schema EXACTLY. Do NOT wrap it in markdown block quotes (```json)."""

        user_prompt = f"Extract the knowledge graph from the following text:\n\n{text}"

        try:
            async with self.semaphore:
                response_text = await self.bridge._call_gemini(
                    [user_prompt],
                    system_instruction=system_prompt,
                    throttle=True,
                    force_json=True
                )

            clean_json = response_text.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_json)
            return GraphExtractionResult(**data)

        except (json.JSONDecodeError, ValidationError) as e:
            logger.warning(f"[GraphExtractor] LLM JSON parsing failed. Skipping chunk. {str(e)[:100]}")
            return None

    async def _upsert_to_neo4j(self, nodes: List[Dict], relationships: List[Dict], doc_uuid: str) -> None:
        cypher_nodes = """
        UNWIND $nodes AS node
        MERGE (n:Entity {id: toUpper(node.id)})
        ON CREATE SET n.entity_type = node.type,
                      n.description = node.description,
                      n.source_documents = [$doc_uuid]
        ON MATCH SET n.source_documents = CASE
                         WHEN NOT $doc_uuid IN n.source_documents THEN n.source_documents + $doc_uuid
                         ELSE n.source_documents END
        """

        cypher_edges = """
        UNWIND $rels AS rel
        MATCH (source:Entity {id: toUpper(rel.source_id)})
        MATCH (target:Entity {id: toUpper(rel.target_id)})
        MERGE (source)-[r:CONNECTED_TO]->(target)
        ON CREATE SET r.relationship_type = rel.type,
                      r.explanation = rel.explanation,
                      r.source_documents = [$doc_uuid]
        ON MATCH SET r.source_documents = CASE
                         WHEN NOT $doc_uuid IN r.source_documents THEN r.source_documents + $doc_uuid
                         ELSE r.source_documents END
        """

        async with self._driver.session() as session:
            try:
                if nodes: await session.run(cypher_nodes, nodes=nodes, doc_uuid=doc_uuid)
                if relationships: await session.run(cypher_edges, rels=relationships, doc_uuid=doc_uuid)
            except Exception as e:
                logger.error(f"[GraphExtractor] Neo4j Cypher execution failed: {e}")

    async def close(self):
        if self._driver:
            await self._driver.close()
            self._connected = False