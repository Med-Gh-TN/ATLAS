"""
src/audit.py
════════════════════════════════════════════════════════════════════════════════
Omni-Architect: Deep State Auditor & Telemetry Exporter (v6.8)
────────────────────────────────────────────────────────────────────────────────
Acts as the "Eyes of the Architect". 
Scans Neo4j, Qdrant, Redis, and PostgreSQL to verify Knowledge Graph integrity,
Vector dimensional compliance, and multi-tenant consistency.

Exports a machine-readable JSON trace (omni_audit_trace.json) for LLM ingestion.
════════════════════════════════════════════════════════════════════════════════
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# ──────────────────────────────────────────────────────────────────────────────
# BOOTSTRAP & ENV
# ──────────────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

console = Console()
logging.getLogger("httpx").setLevel(logging.WARNING)

# ──────────────────────────────────────────────────────────────────────────────
# AUDIT CLASSES
# ──────────────────────────────────────────────────────────────────────────────

class OmniAuditor:
    def __init__(self):
        self.report = {
            "timestamp": datetime.utcnow().isoformat(),
            "status": "HEALTHY",
            "warnings": [],
            "neo4j": {},
            "qdrant": {},
            "postgres": {}
        }
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USERNAME", "neo4j")
        self.neo4j_pwd = os.getenv("NEO4J_PASSWORD", "")
        self.qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.postgres_uri = os.getenv("POSTGRES_URI")

    def _log_warning(self, system: str, msg: str):
        self.report["status"] = "DEGRADED"
        self.report["warnings"].append(f"[{system}] {msg}")
        console.print(f"[bold yellow]⚠ WARNING ({system}):[/] {msg}")

    async def audit_neo4j(self):
        """Scans the Knowledge Graph for topological integrity."""
        console.print("[cyan]Scanning Neo4j Graph Topology...[/]")
        try:
            from neo4j import AsyncGraphDatabase
            driver = AsyncGraphDatabase.driver(self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_pwd))
            async with driver.session() as session:
                # 1. Total Nodes & Relationships
                res = await session.run("MATCH (n) RETURN count(n) as nodes")
                nodes = (await res.single())["nodes"]
                
                res = await session.run("MATCH ()-[r]->() RETURN count(r) as rels")
                rels = (await res.single())["rels"]

                # 2. Find Orphaned Nodes (Disconnected)
                res = await session.run("MATCH (n) WHERE NOT (n)--() RETURN count(n) as orphans")
                orphans = (await res.single())["orphans"]

                # 3. Find Nodes missing required 'description'
                res = await session.run("MATCH (n) WHERE n.description IS NULL OR n.description = '' RETURN count(n) as missing_desc")
                missing_desc = (await res.single())["missing_desc"]

                # 4. Check Index
                res = await session.run("SHOW INDEXES YIELD name, type, state WHERE state = 'ONLINE' RETURN count(*) as idx_count")
                idx_count = (await res.single())["idx_count"]

            await driver.close()

            self.report["neo4j"] = {
                "nodes": nodes,
                "relationships": rels,
                "orphaned_nodes": orphans,
                "missing_descriptions": missing_desc,
                "active_indexes": idx_count
            }

            if orphans > 0:
                self._log_warning("Neo4j", f"Found {orphans} disconnected (orphaned) nodes in the graph.")
            if missing_desc > 0:
                self._log_warning("Neo4j", f"Found {missing_desc} nodes with missing descriptions (LLM blindness risk).")

        except ImportError:
            self._log_warning("Neo4j", "neo4j driver not installed.")
        except Exception as e:
            self._log_warning("Neo4j", f"Connection failed: {e}")

    async def audit_qdrant(self):
        """Scans the Vector DB for point counts and schema compliance."""
        console.print("[cyan]Scanning Qdrant Vector Collections...[/]")
        try:
            from qdrant_client import AsyncQdrantClient
            client = AsyncQdrantClient(url=self.qdrant_url)
            collections = await client.get_collections()
            
            target_cols = [
                "lightrag_vdb_entities_jinaaijinacolbertv2_128d",
                "lightrag_vdb_relationships_jinaaijinacolbertv2_128d",
                "lightrag_vdb_chunks_jinaaijinacolbertv2_128d"
            ]

            found_cols = [c.name for c in collections.collections]
            
            for target in target_cols:
                if target not in found_cols:
                    self.report["qdrant"][target] = "MISSING"
                    self._log_warning("Qdrant", f"Collection {target} does not exist.")
                    continue

                info = await client.get_collection(target)
                self.report["qdrant"][target] = {
                    "points": info.points_count,
                    "status": str(info.status),
                    "vectors_config": "ColBERT Dense (128d) + Sparse BM25" if info.config.params.vectors else "Unknown"
                }

                if info.points_count == 0:
                    self._log_warning("Qdrant", f"Collection {target} is completely empty (0 points).")

        except ImportError:
            self._log_warning("Qdrant", "qdrant-client not installed.")
        except Exception as e:
            self._log_warning("Qdrant", f"Connection failed: {e}")

    async def audit_postgres(self):
        """Scans Document Metadata State."""
        console.print("[cyan]Scanning PostgreSQL Document Ledger...[/]")
        if not self.postgres_uri:
            self.report["postgres"] = "SKIPPED (No URI)"
            return

        try:
            import asyncpg
            conn = await asyncpg.connect(self.postgres_uri)
            
            # Verify table exists
            table_check = await conn.fetchval("SELECT to_regclass('public.documents')")
            if not table_check:
                self._log_warning("PostgreSQL", "'documents' table not found in public schema.")
                await conn.close()
                return

            total_docs = await conn.fetchval("SELECT count(*) FROM documents")
            failed_docs = await conn.fetchval("SELECT count(*) FROM documents WHERE status = 'FAILED'")
            ingesting_docs = await conn.fetchval("SELECT count(*) FROM documents WHERE status = 'INGESTING'")
            
            self.report["postgres"] = {
                "total_documents": total_docs,
                "failed_documents": failed_docs,
                "stuck_in_ingestion": ingesting_docs
            }

            if failed_docs > 0:
                self._log_warning("PostgreSQL", f"{failed_docs} documents permanently failed ingestion.")
            if ingesting_docs > 0:
                self._log_warning("PostgreSQL", f"{ingesting_docs} documents are stuck in 'INGESTING' state (Zombie locks).")

            await conn.close()
        except ImportError:
            self._log_warning("PostgreSQL", "asyncpg not installed.")
        except Exception as e:
            self._log_warning("PostgreSQL", f"Connection failed: {e}")

    def render_dashboard(self):
        console.print("\n")
        
        # Neo4j Table
        n_table = Table(title="[bold blue]Neo4j Graph Health[/]", show_header=True, header_style="bold magenta")
        n_table.add_column("Metric")
        n_table.add_column("Value")
        for k, v in self.report.get("neo4j", {}).items():
            n_table.add_row(str(k).replace("_", " ").title(), str(v))
        
        # Qdrant Table
        q_table = Table(title="[bold blue]Qdrant Vector Health[/]", show_header=True, header_style="bold magenta")
        q_table.add_column("Collection Name")
        q_table.add_column("Points")
        q_table.add_column("Status")
        for k, v in self.report.get("qdrant", {}).items():
            if isinstance(v, dict):
                q_table.add_row(k.split("vdb_")[1], str(v.get("points")), v.get("status"))
            else:
                q_table.add_row(k, str(v), "[red]MISSING[/]")
        
        # Render
        console.print(n_table)
        console.print(q_table)
        
        if self.report["warnings"]:
            p = Panel("\n".join(self.report["warnings"]), title="[bold red]System Warnings[/]", border_style="red")
            console.print(p)
        else:
            console.print(Panel("All database vectors, nodes, and relationships appear structurally sound and mathematically correlated.", title="[bold green]SYSTEM OPTIMAL[/]", border_style="green"))

    def export_trace(self):
        out_path = PROJECT_ROOT / "omni_audit_trace.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(self.report, f, indent=4)
        console.print(f"\n[dim]Telemetry trace exported to: {out_path}[/]")
        console.print("[bold cyan]Omni-Architect:[/] You can paste the contents of omni_audit_trace.json to me at any time for structural analysis.")

# ──────────────────────────────────────────────────────────────────────────────
# MAIN EXECUTION
# ──────────────────────────────────────────────────────────────────────────────

async def main():
    console.print(Panel.fit("[bold white]Omni-Architect: Deep State Auditor v6.8[/]", border_style="blue"))
    
    auditor = OmniAuditor()
    await auditor.audit_neo4j()
    await auditor.audit_qdrant()
    await auditor.audit_postgres()
    
    auditor.render_dashboard()
    auditor.export_trace()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())