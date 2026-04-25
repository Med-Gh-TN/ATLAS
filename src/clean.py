"""
@file clean.py
@description Omni-Architect: Universal State Purger (v7.0 SOTA Annihilator)
@layer State Persistence
@dependencies asyncio, logging, os, shutil, sys, pathlib, dotenv, rich, asyncpg, redis, neo4j, qdrant_client

A standalone nuclear option to flush all databases and workspaces.
Uses SOTA batched transactions and schema introspection to safely 
annihilate data without destroying database topology or model weights.
"""

import asyncio
import logging
import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.prompt import Confirm

# ──────────────────────────────────────────────────────────────────────────────
# BOOTSTRAP & ENV
# ──────────────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

console = Console()
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("cleaner")

# ──────────────────────────────────────────────────────────────────────────────
# WORKSPACE & SYSTEM CACHE PURGER
# ──────────────────────────────────────────────────────────────────────────────

def purge_workspaces() -> bool:
    """
    Deletes generated folders and Python runtime caches. 
    Explicitly PROTECTS local model weights to prevent massive re-downloads.
    """
    success = True
    
    # 1. Primary Data Targets
    targets = [
        PROJECT_ROOT / "rag_workspace",
        PROJECT_ROOT / "OCR" / "output",
        PROJECT_ROOT / ".pytest_cache",
        PROJECT_ROOT / ".mypy_cache"
    ]
    
    for target in targets:
        if target.exists() and target.is_dir():
            try:
                shutil.rmtree(target)
                console.print(f"[green]✓ DELETED[/] directory: {target.name}/")
            except Exception as e:
                console.print(f"[red]✗ FAILED[/] to delete {target.name}/: {e}")
                success = False
        else:
            console.print(f"[dim]• SKIPPED[/] directory (not found): {target.name}/")

    # 2. Deep __pycache__ Sweep
    pycache_count = 0
    for pycache in PROJECT_ROOT.rglob("__pycache__"):
        try:
            shutil.rmtree(pycache)
            pycache_count += 1
        except Exception:
            pass
            
    if pycache_count > 0:
        console.print(f"[green]✓ SWEPT[/] {pycache_count} __pycache__ directories.")
            
    return success

# ──────────────────────────────────────────────────────────────────────────────
# DATABASE PURGERS
# ──────────────────────────────────────────────────────────────────────────────

async def purge_qdrant() -> bool:
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    try:
        from qdrant_client import AsyncQdrantClient
        client = AsyncQdrantClient(url=qdrant_url)
        collections = await client.get_collections()
        
        if not collections.collections:
            console.print("[dim]• SKIPPED[/] Qdrant (0 collections found)")
            return True
            
        for c in collections.collections:
            await client.delete_collection(c.name)
            console.print(f"[green]✓ DROPPED[/] Qdrant collection: {c.name}")
            
        return True
    except ImportError:
        console.print("[yellow]⚠ SKIPPED[/] Qdrant (qdrant-client not installed)")
        return False
    except Exception as e:
        console.print(f"[red]✗ FAILED[/] Qdrant purge: {e}")
        return False


async def purge_neo4j() -> bool:
    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USERNAME", "neo4j")
    pwd = os.getenv("NEO4J_PASSWORD", "")
    
    try:
        from neo4j import AsyncGraphDatabase
        driver = AsyncGraphDatabase.driver(neo4j_uri, auth=(user, pwd))
        async with driver.session() as session:
            # SOTA FIX: Batched deletion prevents Neo4j Transaction Log OOM crashes
            # when wiping massive graphs from 150-page PDFs.
            cypher = """
            MATCH (n)
            CALL { WITH n DETACH DELETE n } IN TRANSACTIONS OF 10000 ROWS
            """
            await session.run(cypher)
            console.print("[green]✓ PURGED[/] Neo4j (Graph annihilated via batched transactions)")
        await driver.close()
        return True
    except ImportError:
        console.print("[yellow]⚠ SKIPPED[/] Neo4j (neo4j driver not installed)")
        return False
    except Exception as e:
        console.print(f"[red]✗ FAILED[/] Neo4j purge: {e}")
        return False


async def purge_redis() -> bool:
    redis_uri = os.getenv("REDIS_URI", "redis://localhost:6379/0")
    try:
        import redis.asyncio as redis
        client = redis.from_url(redis_uri)
        # SOTA FIX: FLUSHALL guarantees no orphaned keys across DB indexes
        await client.flushall(asynchronous=True)
        await client.aclose()
        console.print("[green]✓ FLUSHED[/] Redis database (All indexes)")
        return True
    except ImportError:
        console.print("[yellow]⚠ SKIPPED[/] Redis (redis driver not installed)")
        return False
    except Exception as e:
        console.print(f"[red]✗ FAILED[/] Redis purge: {e}")
        return False


async def purge_postgres() -> bool:
    postgres_uri = os.getenv("POSTGRES_URI")
    if not postgres_uri:
        console.print("[dim]• SKIPPED[/] PostgreSQL (POSTGRES_URI not set in .env)")
        return True
        
    try:
        import asyncpg
        conn = await asyncpg.connect(postgres_uri)
        
        # SOTA FIX: Schema Introspection TRUNCATE. 
        # Physically deletes all rows, including our new parent_chunks table, 
        # without destroying the DB schema, custom types, or extensions.
        rows = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        tables = [r["tablename"] for r in rows]
        
        if not tables:
            console.print("[dim]• SKIPPED[/] PostgreSQL (0 tables found in public schema)")
        else:
            truncate_query = f"TRUNCATE TABLE {', '.join(tables)} CASCADE;"
            await conn.execute(truncate_query)
            console.print(f"[green]✓ TRUNCATED[/] PostgreSQL ({len(tables)} tables wiped, schema topology preserved)")
            
        await conn.close()
        return True
    except ImportError:
        console.print("[yellow]⚠ SKIPPED[/] PostgreSQL (asyncpg not installed)")
        return False
    except Exception as e:
        console.print(f"[red]✗ FAILED[/] PostgreSQL purge: {e}")
        return False

# ──────────────────────────────────────────────────────────────────────────────
# MAIN RUNNER
# ──────────────────────────────────────────────────────────────────────────────

async def main():
    console.print("\n[bold red]======================================================[/]")
    console.print("[bold red] ☢  OMNI-ARCHITECT NUCLEAR PURGE UTILITY (v7.0 SOTA) [/]")
    console.print("[bold red]======================================================[/]\n")
    
    console.print("[white]This will PERMANENTLY DESTROY all data in:[/]")
    console.print("  • Qdrant Vector Database")
    console.print("  • Neo4j Graph Database")
    console.print("  • Redis Cache")
    console.print("  • PostgreSQL Metadata (including AST ParentChunks)")
    console.print("  • Local Workspaces & Python Bytecode Caches\n")
    console.print("[dim italic]Note: Local downloaded model weights are protected and will not be wiped.[/]\n")
    
    if not Confirm.ask("[bold yellow]Are you absolutely sure you want to proceed?[/]", default=False):
        console.print("\n[green]Purge aborted. Data is safe.[/]\n")
        sys.exit(0)
        
    console.print("\n[bold cyan]Initiating SOTA purge sequence...[/]\n")
    
    purge_workspaces()
    await purge_qdrant()
    await purge_neo4j()
    await purge_redis()
    await purge_postgres()
    
    console.print("\n[bold green]======================================================[/]")
    console.print("[bold green] ✓ SYSTEM PURGE COMPLETE. READY FOR CLEAN INGESTION.[/]")
    console.print("[bold green]======================================================[/]\n")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[yellow]Purge interrupted by user.[/]")