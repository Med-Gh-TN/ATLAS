"""
Omni-Architect TOON Parser (v6.4.5 — The Anti-Deadlock Firewall)
────────────────────────────────────────────────────────────────────────────────
This module intercepts and replaces the final extraction processor inside LightRAG.
It forces the system to understand flat Token-Oriented Object Notation (TOON)
and yields perfectly formatted payloads to the Graph Engine.
"""

import logging

logger = logging.getLogger(__name__)

def apply_tuple_parser_patch() -> None:
    """
    [TUPLE-PARSER] Replaces _process_extraction_result in lightrag.operate.
    """
    try:
        import lightrag.operate as operate_module

        async def _toon_process_extraction_result(text, *args, **kwargs):
            nodes_dict = {}
            edges_dict = {}
            dropped_count = 0

            if not isinstance(text, str):
                logger.error(
                    f"Patches [TUPLE-PARSER]: Expected string from LLM/Cache, "
                    f"got {type(text)}. Bypassing extraction."
                )
                return {}, {}

            text = text.replace("```json", "").replace("```", "").strip()
            lines = text.split('\n')
            current_section = 'entities'

            for line in lines:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                if line.startswith('[ENTITIES]'):
                    current_section = 'entities'
                    continue
                elif line.startswith('[RELATIONSHIPS]'):
                    current_section = 'relationships'
                    continue

                if line.startswith('(') and line.endswith(')'):
                    line = line[1:-1].strip()

                parts = [p.strip().strip('"').strip("'") for p in line.split('<SEP>')]

                if len(parts) >= 2:
                    if current_section == 'entities' or len(parts) == 3:
                        entity_name = parts[0].strip()

                        # FIREWALL v6.4.5: Block empty, massive, or single-char artifacts
                        if not entity_name or len(entity_name) < 2 or len(entity_name) > 60 or len(entity_name.split()) > 6:
                            dropped_count += 1
                            continue

                        if entity_name not in nodes_dict:
                            nodes_dict[entity_name] = []

                        nodes_dict[entity_name].append({
                            "entity_name": entity_name,
                            "entity_type": parts[1].strip() if len(parts) > 1 else "UNKNOWN",
                            "description": parts[2].strip() if len(parts) > 2 else "",
                            "source_id": "chunk_placeholder"
                        })

                    elif current_section == 'relationships' or len(parts) >= 4:
                        src_id = parts[0].strip()
                        tgt_id = (parts[2] if len(parts) > 2 else parts[1]).strip()

                        # FIREWALL v6.4.5: Block empty or massive edge endpoints
                        if not src_id or len(src_id) < 2 or len(src_id) > 60 or len(src_id.split()) > 6 or \
                           not tgt_id or len(tgt_id) < 2 or len(tgt_id) > 60 or len(tgt_id.split()) > 6:
                            dropped_count += 1
                            continue

                        edge_key = (src_id, tgt_id)
                        if edge_key not in edges_dict:
                            edges_dict[edge_key] = []

                        edges_dict[edge_key].append({
                            "src_id": src_id,
                            "tgt_id": tgt_id,
                            "keywords": parts[1].strip(),
                            "description": parts[3].strip() if len(parts) > 3 else "",
                            "weight": 1.0,
                            "source_id": "chunk_placeholder"
                        })

            if not nodes_dict and not edges_dict:
                safe_raw = text.replace('\n', '\\n')
                raw_trace = safe_raw[:150] + "..." if len(safe_raw) > 150 else safe_raw
                logger.warning(
                    f"Patches [TUPLE-PARSER]: TOON parsing yielded 0 results (Dropped {dropped_count} rows). "
                    f"Raw LLM Trace: '{raw_trace}'"
                )
            else:
                logger.debug(
                    f"Patches [TUPLE-PARSER]: Mapped {len(nodes_dict)} nodes, {len(edges_dict)} edges. "
                    f"Firewall dropped {dropped_count} invalid rows."
                )

            return nodes_dict, edges_dict

        operate_module._process_extraction_result = _toon_process_extraction_result
        logger.info("Patches [TUPLE-PARSER]: TOON-optimized async extraction processor injected ✓")

    except Exception as e:
        logger.error(f"Patches [TUPLE-PARSER]: CRITICAL FAILURE — {e}")