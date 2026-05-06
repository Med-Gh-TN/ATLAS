"""
Learning Platform Router — serves curriculum content from /doc markdown files.
"""

import os
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Learning"])

CURRICULUM_DIR = Path(__file__).resolve().parents[3] / "doc" / "curriculum"
SOTA_FILE = Path(__file__).resolve().parents[3] / "doc" / "sota.md"

SLUG_TO_FILE = {
    "system-design": "01-system-design.md",
    "apis": "02-apis.md",
    "databases": "03-databases.md",
    "security": "04-security.md",
    "devops": "05-devops.md",
    "performance": "06-performance.md",
    "cloud": "07-cloud.md",
    "monitoring": "08-monitoring.md",
}


class PillarInfo(BaseModel):
    slug: str
    number: int
    title: str
    subtitle: str
    description: str


class CurriculumListResponse(BaseModel):
    pillars: list[PillarInfo]
    sota_available: bool


class LessonResponse(BaseModel):
    slug: str
    title: str
    content: str
    prev_slug: Optional[str] = None
    next_slug: Optional[str] = None


PILLAR_META = [
    {
        "slug": "system-design",
        "number": 1,
        "title": "System Design",
        "subtitle": "The Blueprint",
        "description": "Architecture, microservices, scalability, and distributed systems.",
    },
    {
        "slug": "apis",
        "number": 2,
        "title": "APIs",
        "subtitle": "The Language",
        "description": "REST, GraphQL, gRPC, and API design best practices.",
    },
    {
        "slug": "databases",
        "number": 3,
        "title": "Database Systems",
        "subtitle": "The Memory",
        "description": "SQL, NoSQL, vector databases, and data modeling.",
    },
    {
        "slug": "security",
        "number": 4,
        "title": "Security",
        "subtitle": "The Shield",
        "description": "OWASP, authentication, encryption, and zero-trust architecture.",
    },
    {
        "slug": "devops",
        "number": 5,
        "title": "DevOps",
        "subtitle": "The Factory",
        "description": "CI/CD, containers, infrastructure-as-code, and deployment.",
    },
    {
        "slug": "performance",
        "number": 6,
        "title": "Performance",
        "subtitle": "The Tuning",
        "description": "Load balancing, caching, optimization, and monitoring.",
    },
    {
        "slug": "cloud",
        "number": 7,
        "title": "Cloud Services",
        "subtitle": "The Foundation",
        "description": "AWS, GCP, Azure, and cloud-native architecture patterns.",
    },
    {
        "slug": "monitoring",
        "number": 8,
        "title": "Monitoring",
        "subtitle": "The Pulse",
        "description": "Observability, alerting, SLOs, and incident response.",
    },
]


@router.get("/learn", response_model=CurriculumListResponse)
def list_curriculum():
    return CurriculumListResponse(
        pillars=[PillarInfo(**meta) for meta in PILLAR_META],
        sota_available=SOTA_FILE.exists(),
    )


@router.get("/learn/{slug}", response_model=LessonResponse)
def get_lesson(slug: str):
    file_name = SLUG_TO_FILE.get(slug)
    if not file_name:
        raise HTTPException(status_code=404, detail=f"Lesson '{slug}' not found")

    file_path = CURRICULUM_DIR / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Lesson file not found: {file_name}")

    content = file_path.read_text(encoding="utf-8")
    title = content.split("\n")[0].lstrip("# ").strip() if content else slug

    slugs = list(SLUG_TO_FILE.keys())
    current_idx = slugs.index(slug) if slug in slugs else -1
    prev_slug = slugs[current_idx - 1] if current_idx > 0 else None
    next_slug = slugs[current_idx + 1] if 0 <= current_idx < len(slugs) - 1 else None

    return LessonResponse(
        slug=slug,
        title=title,
        content=content,
        prev_slug=prev_slug,
        next_slug=next_slug,
    )


@router.get("/learn/sota")
def get_sota():
    if not SOTA_FILE.exists():
        raise HTTPException(status_code=404, detail="SOTA document not found")
    return {"title": "State of the Art", "content": SOTA_FILE.read_text(encoding="utf-8")}
