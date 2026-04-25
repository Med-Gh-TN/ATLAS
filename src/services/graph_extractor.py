"""
@file graph_extractor.py
@description SOTA Knowledge Graph Extraction Service with ChildChunk Microscope processing.
@layer Core Logic
@dependencies os, json, logging, asyncio, re, neo4j, pydantic, src.infrastructure.llm.bridge, src.domain.models
"""

import os
import json
import logging
import asyncio
import re
from typing import List, Dict, Any, Optional, Tuple

from neo4j import AsyncGraphDatabase
from pydantic import ValidationError

from infrastructure.llm.bridge import OmniModelBridge
from domain.models import GraphExtractionResult, GraphNode, GraphRelationship, ParentChunk

logger = logging.getLogger(__name__)


class GraphExtractionService:
    def __init__(self, bridge: OmniModelBridge, semaphore: asyncio.Semaphore):
        self.bridge = bridge
        self.semaphore = semaphore
        self._driver = None
        self._connected = False
        self._indexes_created = False
        self._init_neo4j()

    def _init_neo4j(self) -> None:
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        user = os.getenv("NEO4J_USERNAME", "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "")
        if not password: 
            return
        try:
            self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
            self._connected = True
        except Exception as e:
            logger.error(f"[GraphExtractor] Failed to connect to Neo4j: {e}")

    async def _setup_indexes(self) -> None:
        if self._indexes_created or not self._connected:
            return
        
        index_query = "CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE"
        async with self._driver.session() as session:
            try:
                await session.run(index_query)
                self._indexes_created = True
                logger.info("[GraphExtractor] O(1) Entity ID index verified and active.")
            except Exception as e:
                logger.error(f"[GraphExtractor] Index setup failed: {e}")

    async def extract_and_upsert(self, chunks: List[ParentChunk], doc_uuid: str) -> Tuple[List[Dict], List[Dict]]:
        """
        SOTA FIX: Iterates at the Child level to maximize extraction density, and injects 
        parent_id/chunk_index metadata into the resulting dictionaries for Qdrant routing.
        """
        all_nodes = []
        all_relationships = []
        
        if not self._connected or not self._driver: 
            return all_nodes, all_relationships
        
        await self._setup_indexes()

        total_parents = len(chunks)
        for p_idx, parent in enumerate(chunks):
            children = parent.children
            total_children = len(children)
            
            # ⏪ SOTA FIX: The Microscope Effect.
            # We iterate over the ≤512-token Children, not the monolithic Parent.
            # This cures "Needle in a Haystack" fatigue and explodes the extraction yield.
            for c_idx, child in enumerate(children):
                text_content = child.content
                token_count = child.token_count
                
                if not text_content or len(text_content) < 50: 
                    continue

                logger.info(f"[GraphExtractor] 🛡️ Processing Child {c_idx+1}/{total_children} of Parent {p_idx+1}/{total_parents} ({token_count} tokens) - High-Density Mode.")

                try:
                    extraction = await self._extract_from_llm(text_content)
                    if extraction:
                        for n in extraction.nodes:
                            n_dict = n.model_dump()
                            # ⏪ SOTA FIX: Metadata Injection for Qdrant
                            n_dict["parent_id"] = child.parent_id
                            n_dict["chunk_index"] = child.chunk_index
                            all_nodes.append(n_dict)
                            
                        for r in extraction.relationships:
                            r_dict = r.model_dump()
                            # ⏪ SOTA FIX: Metadata Injection for Qdrant
                            r_dict["parent_id"] = child.parent_id
                            r_dict["chunk_index"] = child.chunk_index
                            all_relationships.append(r_dict)
                except Exception as e:
                    logger.error(f"[GraphExtractor] LLM extraction failed on child {child.id}: {e}")

        if all_nodes:
            # We batch the upsert after all children are processed
            await self._upsert_to_neo4j(all_nodes, all_relationships, doc_uuid)
            logger.info(f"[GraphExtractor] 🟢 Successfully upserted {len(all_nodes)} nodes and {len(all_relationships)} relationships for doc {doc_uuid}.")
            
        return all_nodes, all_relationships

    async def _extract_from_llm(self, text: str) -> Optional[GraphExtractionResult]:
        system_prompt = self.bridge.prompts.get("entity_extract")
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
            start_idx = clean_json.find('{')
            end_idx = clean_json.rfind('}')
            
            if start_idx != -1 and end_idx != -1:
                clean_json = clean_json[start_idx:end_idx + 1]

            clean_json = re.sub(r',\s*([\]}])', r'\1', clean_json)
            data = json.loads(clean_json)
            
            if "entities" in data and "nodes" not in data:
                data["nodes"] = data.pop("entities")

            return GraphExtractionResult(**data)

        except (json.JSONDecodeError, ValidationError) as e:
            logger.warning(f"[GraphExtractor] LLM JSON parsing failed. Skipping chunk. {str(e)[:100]}")
            return None

    async def _upsert_to_neo4j(self, nodes: List[Dict], relationships: List[Dict], doc_uuid: str) -> None:
        cypher_nodes = """
        UNWIND $nodes AS node
        MERGE (n:Entity {id: toUpper(coalesce(node.id, node.entity_name))})
        ON CREATE SET n.entity_type = coalesce(node.type, node.entity_type),
                      n.description = node.description,
                      n.source_documents = [$doc_uuid]
        ON MATCH SET n.source_documents = CASE 
                         WHEN NOT $doc_uuid IN n.source_documents THEN n.source_documents + $doc_uuid 
                         ELSE n.source_documents END
        """

        cypher_edges = """
        UNWIND $rels AS rel
        MATCH (source:Entity {id: toUpper(coalesce(rel.source_id, rel.source_entity))})
        MATCH (target:Entity {id: toUpper(coalesce(rel.target_id, rel.target_entity))})
        MERGE (source)-[r:CONNECTED_TO]->(target)
        ON CREATE SET r.relationship_type = coalesce(rel.type, rel.relationship_desc),
                      r.explanation = coalesce(rel.explanation, rel.relationship_desc),
                      r.weight = coalesce(rel.weight, 1.0),
                      r.source_documents = [$doc_uuid]
        ON MATCH SET r.weight = coalesce(r.weight, 1.0) + coalesce(rel.weight, 1.0),
                     r.source_documents = CASE 
                         WHEN NOT $doc_uuid IN r.source_documents THEN r.source_documents + $doc_uuid 
                         ELSE r.source_documents END
        """

        async with self._driver.session() as session:
            try:
                if nodes: 
                    await session.run(cypher_nodes, nodes=nodes, doc_uuid=doc_uuid)
                if relationships: 
                    await session.run(cypher_edges, rels=relationships, doc_uuid=doc_uuid)
            except Exception as e:
                logger.error(f"[GraphExtractor] Neo4j Cypher execution failed: {e}")

    async def close(self):
        if self._driver:
            await self._driver.close()
            self._connected = False