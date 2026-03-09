from typing import List
import sqlalchemy as sa
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from sqlalchemy.future import select
from app.models.all_models import Contribution, DocumentVersion

router = APIRouter()

def _embed_query(q: str):
    try:
        from sentence_transformers import SentenceTransformer
    except Exception:
        raise HTTPException(status_code=503, detail="Embeddings unavailable")
    m = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    v = m.encode([q], normalize_embeddings=True)[0].tolist()
    return v

@router.get("/search")
async def semantic_search(query: str = Query(...), top_k: int = Query(10, ge=1, le=50), session: AsyncSession = Depends(get_session)):
    vec = _embed_query(query)
    sql = sa.text("""
        SELECT dv.id as document_version_id, c.title as title, 1 - (e.vector <=> :q) as score
        FROM documentembedding e
        JOIN documentversion dv ON dv.id = e.document_version_id
        JOIN contribution c ON c.id = dv.contribution_id
        WHERE c.status = 'APPROVED'
        ORDER BY e.vector <=> :q
        LIMIT :k
    """)
    res = await session.execute(sql.bindparams(sa.bindparam("q", value=vec), sa.bindparam("k", value=top_k)))
    rows = res.mappings().all()
    return rows

@router.get("/search/text")
async def text_search(q: str = Query(...), limit: int = 20, offset: int = 0, session: AsyncSession = Depends(get_session)):
    pattern = f"%{q}%"
    j = select(Contribution, DocumentVersion).join(DocumentVersion, Contribution.id == DocumentVersion.contribution_id)
    j = j.where((Contribution.title.ilike(pattern)) | (DocumentVersion.ocr_text.ilike(pattern)))
    j = j.where(Contribution.status == "APPROVED")
    total = (await session.execute(select(sa.func.count()).select_from(j.subquery()))).scalar_one()
    rows = (await session.execute(j.offset(offset).limit(limit))).all()
    out = [{"contribution_id": c.id, "title": c.title, "version_id": dv.id} for c, dv in rows]
    return {"items": out, "meta": {"total": total, "limit": limit, "offset": offset}}
