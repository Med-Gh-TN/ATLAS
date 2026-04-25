import os
import io
import base64
import cv2
import numpy as np
import tempfile
import socket
import struct
import structlog
import asyncio
from app.services.atlas_ocr_src.pdf_worker import get_docling_markdown_for_file, extract_pages_as_images
from app.services.atlas_ocr_src.infrastructure.llm.bridge import OmniModelBridge
from celery import shared_task
from sqlmodel import Session, select, create_engine
from minio.commonconfig import CopySource

from app.core.config import settings
from app.models.all_models import DocumentVersion, DocumentPipelineStatus, Contribution
from app.services.doc_processing.storage import minio_client
from app.services.ai_core.embedding_tasks import embed_document

# US-07 Dependencies
from langdetect import detect, LangDetectException
from simhash import Simhash

# Use a synchronous engine for Celery tasks
sync_engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql")
)

# =============================================================================
# DEFENSIVE HELPER METHODS
# =============================================================================





def _scan_file_with_clamav(
    file_path: str,
    host: str = os.getenv("CLAMAV_HOST", "localhost"),
    port: int = 3310,
) -> bool:
    """
    DEFENSIVE ARCHITECTURE: US-24 Antivirus Scanner.

    Communicates with the ClamAV daemon natively over TCP using the
    zINSTREAM protocol. Operates in a "Fail-Closed" state: returns False
    if infected OR if the scanner is unreachable.
    """
    log = structlog.get_logger().bind(scanner="clamav", host=host)
    try:
        with socket.create_connection((host, port), timeout=15) as sock:
            sock.sendall(b"zINSTREAM\0")

            with open(file_path, "rb") as f:
                while chunk := f.read(4096):
                    sock.sendall(struct.pack("!I", len(chunk)) + chunk)

            # Zero-length chunk signals end-of-stream to daemon
            sock.sendall(struct.pack("!I", 0))

            response = sock.recv(1024).decode("utf-8").strip()

            if "OK" in response:
                return True
            elif "FOUND" in response:
                log.warning(
                    "SECURITY ALERT: Malware detected during ClamAV scan.",
                    response=response,
                )
                return False
            else:
                log.error("ClamAV returned unexpected response.", response=response)
                return False

    except socket.timeout:
        log.error("CRITICAL: ClamAV daemon connection timed out. Failing closed.")
        return False
    except Exception as e:
        log.error(
            "CRITICAL: ClamAV connection failed. Failing closed.", error=str(e)
        )
        return False


# =============================================================================
# SIDE EFFECTS & ROUTING
# =============================================================================

@shared_task(name="notify_admin_degraded_scan")
def notify_admin_degraded_scan(contribution_id: str, quality_score: float, document_id: str):
    """
    Side-effect isolation for notifying administrators of degraded uploads.
    Prevents SMTP blockages from halting the OCR pipeline.
    """
    log = structlog.get_logger().bind(task="notify_admin_degraded_scan")
    if not settings.ADMIN_ALERT_EMAIL:
        log.warning("admin_alert_email_not_configured_skipping_notification")
        return

    log.info(
        "dispatching_admin_alert",
        to=settings.ADMIN_ALERT_EMAIL,
        subject=f"ATLAS Alert: Degraded Scan Detected (Score: {quality_score:.2f})",
        contribution_id=contribution_id,
        document_id=document_id
    )
    # Architecture Node: Bind to app.services.email_service.send_email() here
    # once SMTP templates for admins are finalized.


# =============================================================================
# CORE PIPELINE
# =============================================================================

@shared_task(name="process_document_ocr")
def process_document_ocr(document_version_id: str):
    """
    US-06, US-07, & US-24 Hybrid OCR Pipeline via Multimodal LLM (Ollama).
    """
    log = structlog.get_logger().bind(
        task="process_document_ocr",
        document_version_id=document_version_id,
    )
    log.info("start_ocr_pipeline")

    final_language = "unknown"
    is_scan = False

    with Session(sync_engine) as session:
        doc = session.get(DocumentVersion, document_version_id)
        if not doc:
            log.error("document_not_found")
            return

        doc.pipeline_status = DocumentPipelineStatus.OCR_PROCESSING
        session.add(doc)
        session.commit()

        extracted_text = ""
        total_quality_score = 0.0
        scanned_pages_count = 0
        temp_path = None

        _, file_extension = os.path.splitext(doc.storage_path)
        file_extension = file_extension.lower()

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as tmp:
                temp_path = tmp.name

            # ----------------------------------------------------------------
            # Stage 1 — Download from MinIO quarantine
            # ----------------------------------------------------------------
            log.info("downloading_from_quarantine_storage", path=doc.storage_path)
            minio_client.ensure_bucket_exists()
            minio_client.client.fget_object(
                minio_client.bucket_name,
                doc.storage_path,
                temp_path,
            )

            # ----------------------------------------------------------------
            # Stage 2 — ClamAV antivirus (US-24)
            # ----------------------------------------------------------------
            log.info("initiating_clamav_scan")
            is_clean = _scan_file_with_clamav(temp_path)

            if not is_clean:
                log.critical(
                    "SECURITY ALERT: File failed ClamAV scan. "
                    "Destroying object and aborting pipeline."
                )
                minio_client.client.remove_object(
                    minio_client.bucket_name, doc.storage_path
                )
                doc.pipeline_status = DocumentPipelineStatus.FAILED
                doc.storage_path = "DELETED_SECURITY_VIOLATION"
                doc.is_deleted = True
                session.add(doc)
                session.commit()
                return

            log.info("clamav_scan_passed_clean")

            # ----------------------------------------------------------------
            # Stage 3 — Promote quarantine → permanent storage
            # ----------------------------------------------------------------
            if doc.storage_path.startswith("quarantine/"):
                contribution = session.get(Contribution, doc.contribution_id)
                if contribution:
                    permanent_path = (
                        f"courses/{contribution.course_id}/"
                        f"v{doc.version_number}_{doc.id}{file_extension}"
                    )
                    log.info("promoting_file_to_permanent_storage", path=permanent_path)

                    minio_client.client.copy_object(
                        minio_client.bucket_name,
                        permanent_path,
                        CopySource(minio_client.bucket_name, doc.storage_path),
                    )
                    minio_client.client.remove_object(
                        minio_client.bucket_name, doc.storage_path
                    )
                    doc.storage_path = permanent_path
                    session.add(doc)
                    session.commit()

            # ----------------------------------------------------------------
            # Stage 4 & 5 — Defensive Hybrid extraction & Multimodal OCR
            # ----------------------------------------------------------------
            log.info("running_extraction_pipeline", file_type=file_extension)


            if file_extension == '.pdf':
                # Try docling first
                try:
                    page_text = get_docling_markdown_for_file(temp_path)
                    if page_text and len(page_text.strip()) >= 50:
                        extracted_text = page_text
                except Exception as e:
                    log.warning("docling_extraction_failed_routing_to_vision_llm", error=str(e))

                # Fallback to Vision LLM if page is scanned or text is too sparse
                if not extracted_text or len(extracted_text.strip()) < 50:
                    log.info("scanned_page_detected_routing_to_vision_llm")
                    scanned_pages_count += 1
                    try:
                        bridge = OmniModelBridge()
                        # Bridge requires an active asyncio event loop or we use asyncio.run
                        page_batches = extract_pages_as_images(temp_path)
                        ocr_texts = []
                        page_cursor = 0
                        for batch in page_batches:
                            # Quality metrics
                            for page_bytes in batch:
                                img_np = cv2.imdecode(np.frombuffer(page_bytes, np.uint8), cv2.IMREAD_COLOR)
                                gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
                                variance = cv2.Laplacian(gray, cv2.CV_64F).var()
                                total_quality_score += variance

                            try:
                                page_text = asyncio.run(bridge.vlm_ocr_page(batch, page_num_start=page_cursor))
                                if page_text and page_text.strip():
                                    ocr_texts.append(page_text.strip())
                            except Exception as ocr_err:
                                log.error("vlm_ocr_page_error", error=str(ocr_err))
                            finally:
                                page_cursor += len(batch)

                        extracted_text = "\n\n".join(ocr_texts) if ocr_texts else ""
                    except Exception as e:
                        log.error("vlm_ocr_failed", error=str(e))
            elif file_extension in ['.png', '.jpg', '.jpeg']:
                log.info("direct_image_ocr_detected_routing_to_vision_llm")
                scanned_pages_count = 1
                try:
                    bridge = OmniModelBridge()
                    with open(temp_path, "rb") as f:
                        img_bytes = f.read()

                    img_np = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                    gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
                    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
                    total_quality_score += variance

                    page_text = asyncio.run(bridge.vlm_ocr_page([img_bytes]))
                    extracted_text = page_text.strip()
                except Exception as img_err:
                    log.error("failed_to_process_direct_image", error=str(img_err))

            else:
                log.warning("unsupported_file_format_for_text_extraction", extension=file_extension)
                extracted_text = f"[Text extraction not supported natively for {file_extension} files in this version. File stored safely.]"

            extracted_text = extracted_text.strip()




            # ----------------------------------------------------------------
            # Stage 6 — Language detection & SimHash deduplication (US-07)
            # ----------------------------------------------------------------
            detected_lang = "unknown"
            simhash_str = None

            if extracted_text and not extracted_text.startswith("[Text extraction not supported"):
                try:
                    detected_lang = detect(extracted_text)
                except LangDetectException:
                    log.warning("langdetect_failed")

                simhash_str = str(Simhash(extracted_text).value)

                existing_dup = session.exec(
                    select(DocumentVersion).where(
                        DocumentVersion.simhash == simhash_str,
                        DocumentVersion.id != doc.id,
                    )
                ).first()

                if existing_dup:
                    log.warning(
                        "semantic_duplicate_detected",
                        original_id=str(existing_dup.id),
                    )

            # ----------------------------------------------------------------
            # Stage 7 — Side-Effects, Persistence & Pipeline Advance
            # ----------------------------------------------------------------
            doc.ocr_text = extracted_text
            doc.language = detected_lang
            doc.simhash = simhash_str

            if scanned_pages_count > 0:
                doc.quality_score = total_quality_score / scanned_pages_count

                # US-07: The Total Coverage Side-Effect Execution
                if doc.quality_score < settings.OCR_QUALITY_ALERT_THRESHOLD:
                    log.warning(
                        "document_quality_below_alert_threshold",
                        avg_score=doc.quality_score,
                        threshold=settings.OCR_QUALITY_ALERT_THRESHOLD,
                        contribution_id=str(doc.contribution_id)
                    )

                    # 1. State Persistence (Schema Mutator)
                    contribution = session.get(Contribution, doc.contribution_id)
                    if contribution:
                        contribution.quality_flag = True
                        session.add(contribution)

                    # 2. Asynchronous Notification Dispatch
                    notify_admin_degraded_scan.delay(
                        contribution_id=str(doc.contribution_id),
                        quality_score=doc.quality_score,
                        document_id=str(doc.id)
                    )

            doc.pipeline_status = DocumentPipelineStatus.EMBEDDING
            session.add(doc)
            session.commit()

            log.info(
                "ocr_success",
                chars_extracted=len(extracted_text),
                language=detected_lang,
            )

            final_language = doc.language
            is_scan = scanned_pages_count > 0

            embed_document.delay(str(document_version_id))

        except Exception as e:
            log.error("ocr_pipeline_failed", error=str(e), exc_info=True)
            doc.pipeline_status = DocumentPipelineStatus.FAILED
            session.add(doc)
            session.commit()

        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError as cleanup_error:
                    log.warning(
                        "temp_file_cleanup_failed", error=str(cleanup_error)
                    )

    return {
        "status": "completed",
        "document_id": document_version_id,
        "language": final_language,
        "is_scan": is_scan,
    }