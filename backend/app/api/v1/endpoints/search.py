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
    m = SentenceTransformer("sentence-transformers/paraphrase-multilingual-mpnet-base-v2")
    v = m.encode([q], normalize_embeddings=True)[0].tolist()
    return v

@router.get("/search")
async def search(query: str = Query(...), top_k: int = Query(10, ge=1, le=50), session: AsyncSession = Depends(get_session)):
    vec = _embed_query(query)
    sem_sql = sa.text("""
        SELECT dv.id as document_version_id, c.title as title, MIN(e.vector <=> :q) as dist
        FROM documentembedding e
        JOIN documentversion dv ON dv.id = e.document_version_id
        JOIN contribution c ON c.id = dv.contribution_id
        WHERE c.status = 'APPROVED'
        GROUP BY dv.id, c.title
        ORDER BY MIN(e.vector <=> :q)
        LIMIT :k
    """)
    sem_res = await session.execute(sem_sql.bindparams(sa.bindparam("q", value=vec), sa.bindparam("k", value=top_k * 5)))
    sem_rows = sem_res.mappings().all()

    lex_sql = sa.text("""
        SELECT dv.id as document_version_id, c.title as title,
               ts_rank_cd(
                   to_tsvector('simple', coalesce(c.title,'') || ' ' || coalesce(dv.ocr_text,'')),
                   plainto_tsquery('simple', :qtext)
               ) as rank
        FROM documentversion dv
        JOIN contribution c ON c.id = dv.contribution_id
        WHERE c.status = 'APPROVED'
          AND to_tsvector('simple', coalesce(c.title,'') || ' ' || coalesce(dv.ocr_text,'')) @@ plainto_tsquery('simple', :qtext)
        ORDER BY rank DESC
        LIMIT :k
    """)
    lex_res = await session.execute(lex_sql.bindparams(sa.bindparam("qtext", value=query), sa.bindparam("k", value=top_k * 5)))
    lex_rows = lex_res.mappings().all()

    k_rrf = 60
    sem_rank = {r["document_version_id"]: i + 1 for i, r in enumerate(sem_rows)}
    lex_rank = {r["document_version_id"]: i + 1 for i, r in enumerate(lex_rows)}

    titles = {}
    for r in sem_rows:
        titles[r["document_version_id"]] = r["title"]
    for r in lex_rows:
        titles[r["document_version_id"]] = r["title"]

    all_ids = set(sem_rank.keys()) | set(lex_rank.keys())
    fused = []
    for vid in all_ids:
        s = 0.0
        if vid in sem_rank:
            s += 1.0 / (k_rrf + sem_rank[vid])
        if vid in lex_rank:
            s += 1.0 / (k_rrf + lex_rank[vid])
        fused.append({"document_version_id": vid, "title": titles.get(vid), "score": s})

    fused.sort(key=lambda x: x["score"], reverse=True)
    return fused[:top_k]

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
