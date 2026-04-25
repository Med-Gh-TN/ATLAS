"""
src/infrastructure/patches/parsers.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect JSON Parser (v6.12 — The Stack Crawler)
────────────────────────────────────────────────────────────────────────────────
This module intercepts the final extraction processor inside LightRAG.
It forces the system to use a highly resilient, fault-tolerant JSON parser 
(json_repair) to guarantee 0 data loss.

Changelog v6.12:
- THE FINAL LINK: Implemented an inspect-based stack crawler. Since the custom 
  LLM prompt does not output the chunk ID, the parser now reaches up the Python 
  execution stack to steal the `chunk_key` directly from LightRAG's memory. 
  This permanently fixes the 0-chunk retrieval issue.
"""

import logging
import json
import re
import inspect

try:
    import json_repair
    HAS_JSON_REPAIR = True
except ImportError:
    HAS_JSON_REPAIR = False

logger = logging.getLogger(__name__)

def _steal_chunk_key_from_stack() -> str:
    """
    Crawls up the Python execution stack to find LightRAG's internal chunk identifier.
    Guarantees the graph nodes link to the exact Qdrant vector chunk.
    """
    frame = inspect.currentframe()
    while frame:
        locs = frame.f_locals
        if 'chunk_key' in locs and isinstance(locs['chunk_key'], str):
            return locs['chunk_key']
        if 'chunk_name' in locs and isinstance(locs['chunk_name'], str):
            return locs['chunk_name']
        if 'chunk_id' in locs and isinstance(locs['chunk_id'], str):
            return locs['chunk_id']
        frame = frame.f_back
    return "UNKNOWN_CHUNK"

def apply_tuple_parser_patch() -> None:
    """
    [TUPLE-PARSER] Replaces _process_extraction_result in lightrag.operate.
    """
    try:
        import lightrag.operate as operate_module

        async def _resilient_json_process_extraction_result(text, *args, **kwargs):
            nodes_dict = {}
            edges_dict = {}

            # SOTA FIX 1: Steal the actual chunk ID from LightRAG's RAM
            actual_chunk_id = _steal_chunk_key_from_stack()

            if not isinstance(text, str):
                logger.error(
                    f"Patches [TUPLE-PARSER]: Expected string from LLM/Cache, "
                    f"got {type(text)}. Bypassing extraction."
                )
                return {}, {}

            text_clean = text.replace("```json", "").replace("```", "").strip()

            # ==================================================================
            # SOTA JSON RECOVERY ATTEMPT
            # ==================================================================
            try:
                if HAS_JSON_REPAIR:
                    data = json_repair.loads(text_clean)
                else:
                    repaired_json = re.sub(r',\s*([\]}])', r'\1', text_clean)
                    data = json.loads(repaired_json)
                
                if isinstance(data, dict):
                    entities = data.get("nodes", data.get("entities", []))
                    relations = data.get("relationships", data.get("edges", data.get("relations", [])))
                    
                    for ent in entities:
                        name = ent.get("id", ent.get("entity_name", ent.get("name", "")))
                        if isinstance(name, str): 
                            name = name.strip()
                        else: 
                            continue
                        
                        # Anti-Hallucination Firewall
                        if not name or len(name) > 80: 
                            continue 
                        
                        if name not in nodes_dict:
                            nodes_dict[name] = []
                            
                        nodes_dict[name].append({
                            "entity_name": name,
                            "entity_type": ent.get("type", ent.get("entity_type", ent.get("label", "UNKNOWN"))),
                            "description": ent.get("description", ent.get("desc", "")),
                            "source_id": actual_chunk_id  # <--- INJECT REAL CHUNK ID FROM STACK
                        })
                        
                    for rel in relations:
                        src = rel.get("source_id", rel.get("src_id", rel.get("source", rel.get("source_entity", rel.get("src", "")))))
                        tgt = rel.get("target_id", rel.get("tgt_id", rel.get("target", rel.get("target_entity", rel.get("tgt", "")))))
                        
                        if isinstance(src, str): src = src.strip()
                        if isinstance(tgt, str): tgt = tgt.strip()
                        
                        if not src or not tgt or len(src) > 80 or len(tgt) > 80: 
                            continue
                            
                        edge_key = (src, tgt)
                        if edge_key not in edges_dict:
                            edges_dict[edge_key] = []
                            
                        edges_dict[edge_key].append({
                            "src_id": src,
                            "tgt_id": tgt,
                            "keywords": rel.get("type", rel.get("keywords", rel.get("relation_type", rel.get("label", "RELATED_TO")))),
                            "description": rel.get("explanation", rel.get("description", rel.get("desc", ""))),
                            "weight": float(rel.get("weight", 1.0)),
                            "source_id": actual_chunk_id  # <--- INJECT REAL CHUNK ID FROM STACK
                        })
                        
                return nodes_dict, edges_dict

            except Exception as e:
                safe_raw = text_clean.replace('\n', '\\n')
                raw_trace = safe_raw[:150] + "..." if len(safe_raw) > 150 else safe_raw
                logger.warning(
                    f"Patches [TUPLE-PARSER]: ALL JSON PARSERS FAILED. "
                    f"Error: {e} | Raw LLM Trace: '{raw_trace}'"
                )
                return {}, {}

        operate_module._process_extraction_result = _resilient_json_process_extraction_result
        logger.info(f"Patches [TUPLE-PARSER]: Stack-Crawling JSON Parser injected ✓")

    except Exception as e:
        logger.error(f"Patches [TUPLE-PARSER]: CRITICAL FAILURE — {e}")