import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

# ARCHITECTURAL FIX: Explicitly import from the specific IAM dependency provider
from app.api.v1.endpoints.auth.me import get_current_user
from app.models.all_models import User

# ARCHITECTURAL FIX: Re-routed to the new Document Processing Bounded Context
from app.services.doc_processing.storage import minio_client

# ARCHITECTURAL ENFORCEMENT: Explicit boundary logging for Storage telemetry
logger = logging.getLogger("app.api.v1.endpoints.files")
router = APIRouter()


@router.get("/proxy/{storage_path:path}")
async def proxy_file(
    storage_path: str,
    current_user: User = Depends(get_current_user),
):
    """
    ARCHITECTURE FIX: MinIO Cross-Origin Port Block Proxy.

    Root cause: Presigned MinIO URLs point to http://localhost:9000/...
    Browsers and ad-blockers block cross-origin port requests (ERR_BLOCKED_BY_CLIENT).

    Solution: Stream the file through this FastAPI endpoint (port 8000) instead.
    The browser sees the request as same-origin to the API, while FastAPI
    fetches privately from MinIO on the backend network.

    Security: Zero-Trust enforced. Requires a valid JWT via get_current_user.
    """
    try:
        # Server-to-server: fetch directly from MinIO using the internal SDK
        # The 'minio_client' is now part of the doc_processing domain.
        response = minio_client.client.get_object(
            minio_client.bucket_name,
            storage_path
        )

        # Determine content type — force PDF for PDF files regardless of what
        # MinIO returns, as application/octet-stream can break inline browser rendering.
        content_type = response.headers.get("content-type", "application/octet-stream")
        if storage_path.lower().endswith(".pdf"):
            content_type = "application/pdf"

        response_headers = {
            # Render inline (tells browser not to download automatically)
            "Content-Disposition": "inline",
            # Cache for 1 hour on client side to optimize bandwidth
            "Cache-Control": "private, max-age=3600",
        }

        # Forward Content-Length if available (enables UI progress bars)
        if "content-length" in response.headers:
            response_headers["Content-Length"] = response.headers["content-length"]

        def stream():
            """Memory-efficient chunked streaming from MinIO to Client."""
            try:
                for chunk in response.stream(amt=65536): # 64KB chunks
                    yield chunk
            finally:
                response.close()
                response.release_conn()

        return StreamingResponse(
            stream(),
            media_type=content_type,
            headers=response_headers,
        )

    except Exception as e:
        logger.error(f"File proxy failed for path '{storage_path}' (User: {current_user.id}): {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found or storage unavailable."
        )