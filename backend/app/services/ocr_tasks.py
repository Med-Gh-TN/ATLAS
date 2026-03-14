import os
import tempfile
import socket
import struct
import cv2
import numpy as np
import pdfplumber
from celery import shared_task
from sqlmodel import Session, select, create_engine
from minio.commonconfig import CopySource

from app.core.config import settings
from app.models.all_models import DocumentVersion, DocumentPipelineStatus, Contribution
from app.services.storage import minio_client
from app.services.embedding_tasks import embed_document
import structlog

# US-07 Dependencies
from langdetect import detect, LangDetectException
from simhash import Simhash
from paddleocr import PaddleOCR

# Use a synchronous engine for Celery tasks
sync_engine = create_engine(settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql"))

# Defensive Architecture: Lazy initialization for ML models to prevent Celery process forking issues
_ocr_engine = None

def get_ocr_engine():
    """
    Singleton initializer for PaddleOCR.
    Initialized with 'ar' which covers Arabic and English. 
    Can be dynamically expanded based on business logic.
    """
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = PaddleOCR(use_angle_cls=True, lang='ar', show_log=False)
    return _ocr_engine

def _scan_file_with_clamav(file_path: str, host: str = "clamav", port: int = 3310) -> bool:
    """
    DEFENSIVE ARCHITECTURE: US-24 Antivirus Scanner.
    Communicates with the ClamAV daemon natively over TCP using the zINSTREAM protocol.
    Operates in a "Fail-Closed" state: returns False if infected OR if the scanner is unreachable.
    """
    log = structlog.get_logger().bind(scanner="clamav", host=host)
    try:
        with socket.create_connection((host, port), timeout=15) as sock:
            # Initiate streaming protocol
            sock.sendall(b"zINSTREAM\0")
            
            # Stream file in chunks to avoid memory bloat
            with open(file_path, "rb") as f:
                while chunk := f.read(4096):
                    # Protocol requires 4-byte network-byte-order chunk length prefix
                    sock.sendall(struct.pack("!I", len(chunk)) + chunk)
            
            # Send zero-length chunk to terminate stream
            sock.sendall(struct.pack("!I", 0))
            
            # Read and parse daemon response
            response = sock.recv(1024).decode("utf-8").strip()
            
            if "OK" in response:
                return True
            elif "FOUND" in response:
                log.warning("SECURITY ALERT: Malware detected during ClamAV scan.", response=response)
                return False
            else:
                log.error("ClamAV returned unexpected response.", response=response)
                return False
    except socket.timeout:
        log.error("CRITICAL: ClamAV daemon connection timed out. Failing closed.")
        return False
    except Exception as e:
        log.error("CRITICAL: ClamAV connection failed. Failing closed.", error=str(e))
        return False

@shared_task(name="process_document_ocr")
def process_document_ocr(document_version_id: str):
    """
    US-06, US-07, & US-24 Hybrid Pipeline:
    1. Downloads file from MinIO quarantine securely.
    2. Runs ClamAV Antivirus scan. (Fail-Closed)
    3. Moves clean file to permanent storage.
    4. Runs pdfplumber for native text extraction.
    5. Fallback to PaddleOCR for scanned pages (Arabic/French/Mixed).
    6. Calculates Laplacian variance for scan quality (Blur detection).
    7. Detects language and generates SimHash for semantic deduplication.
    8. Updates DB and triggers Embedding task.
    """
    log = structlog.get_logger().bind(task="process_document_ocr", document_version_id=document_version_id)
    log.info("start_ocr_pipeline")
    
    with Session(sync_engine) as session:
        # Fetch document record
        doc = session.get(DocumentVersion, document_version_id)
        if not doc:
            log.error("document_not_found")
            return
            
        doc.pipeline_status = DocumentPipelineStatus.OCR_PROCESSING
        session.add(doc)
        session.commit()

        # Defensive Architecture: Secure temporary file to prevent concurrent Celery worker collisions
        extracted_text = ""
        total_quality_score = 0.0
        scanned_pages_count = 0
        
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
                temp_path = temp_file.name

            # 1. Download from MinIO Quarantine
            log.info("downloading_from_quarantine_storage", path=doc.storage_path)
            minio_client.ensure_bucket_exists()
            minio_client.client.fget_object(
                minio_client.bucket_name, 
                doc.storage_path, 
                temp_path
            )
            
            # 2. US-24: ClamAV Antivirus Scan
            log.info("initiating_clamav_scan")
            is_clean = _scan_file_with_clamav(temp_path)
            
            if not is_clean:
                # SIDE-EFFECT: Audit log & Quarantine enforcement
                log.critical("SECURITY ALERT: File failed ClamAV scan. Destroying object and aborting pipeline.")
                
                # Delete the infected object from the MinIO quarantine bucket
                minio_client.client.remove_object(minio_client.bucket_name, doc.storage_path)
                
                doc.pipeline_status = DocumentPipelineStatus.FAILED
                # Explicitly nullify the storage path as the file no longer exists
                doc.storage_path = None
                session.add(doc)
                session.commit()
                return

            log.info("clamav_scan_passed_clean")

            # 3. Promote from Quarantine to Permanent Storage
            if doc.storage_path.startswith("quarantine/"):
                contribution = session.get(Contribution, doc.contribution_id)
                if contribution:
                    _, ext = os.path.splitext(doc.storage_path)
                    
                    # Construct permanent SOTA path: courses/{course_id}/v{version}_{uuid}.ext
                    permanent_path = f"courses/{contribution.course_id}/v{doc.version_number}_{doc.id}{ext}"
                    
                    log.info("promoting_file_to_permanent_storage", path=permanent_path)
                    
                    # Copy to permanent path
                    minio_client.client.copy_object(
                        minio_client.bucket_name,
                        permanent_path,
                        CopySource(minio_client.bucket_name, doc.storage_path)
                    )
                    
                    # Remove from quarantine
                    minio_client.client.remove_object(minio_client.bucket_name, doc.storage_path)
                    
                    # Update DB State
                    doc.storage_path = permanent_path
                    session.add(doc)
                    session.commit()

            # 4. Run Hybrid Extraction (pdfplumber + PaddleOCR fallback)
            log.info("running_extraction_pipeline")
            with pdfplumber.open(temp_path) as pdf:
                for page in pdf.pages:
                    # Attempt native extraction first
                    page_text = page.extract_text()
                    
                    # Heuristic: If native text is absent or extremely sparse, it's likely a scan
                    if not page_text or len(page_text.strip()) < 50:
                        log.info("scanned_page_detected", page_number=page.page_number)
                        scanned_pages_count += 1
                        
                        # Zero-cost optimization: Use pdfplumber to generate PIL image, avoiding pdf2image dependency
                        pil_img = page.to_image(resolution=300).original
                        img_cv = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                        
                        # Calculate Quality Score: Laplacian variance (Blur detection)
                        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
                        variance = cv2.Laplacian(gray, cv2.CV_64F).var()
                        total_quality_score += variance
                        
                        if variance < 100.0:  # Warning threshold for blurred documents
                            log.warning("low_scan_quality", variance=variance, page_number=page.page_number)
                        
                        # Execute PaddleOCR
                        ocr = get_ocr_engine()
                        result = ocr.ocr(img_cv, cls=True)
                        
                        if result and result[0]:
                            # Reconstruct text from bounding boxes
                            page_text = "\n".join([line[1][0] for line in result[0]])
                        else:
                            page_text = ""
                    
                    if page_text:
                        extracted_text += page_text + "\n\n"
            
            # Clean up text
            extracted_text = extracted_text.strip()
            
            # 5. Post-Processing: Language Detection & Semantic SimHash (US-07)
            detected_lang = "unknown"
            simhash_str = None
            
            if extracted_text:
                try:
                    detected_lang = detect(extracted_text)
                except LangDetectException:
                    log.warning("langdetect_failed")
                
                simhash_str = str(Simhash(extracted_text).value)
                
                # Semantic Duplication Check
                existing_dup = session.exec(
                    select(DocumentVersion)
                    .where(DocumentVersion.simhash == simhash_str, DocumentVersion.id != doc.id)
                ).first()
                
                if existing_dup:
                    log.warning("semantic_duplicate_detected", original_id=str(existing_dup.id))
            
            # 6. Update DB & Transition State
            doc.ocr_text = extracted_text
            doc.language = detected_lang
            doc.simhash = simhash_str
            
            if scanned_pages_count > 0:
                doc.quality_score = total_quality_score / scanned_pages_count
            
            doc.pipeline_status = DocumentPipelineStatus.EMBEDDING
            session.add(doc)
            session.commit()
            
            log.info("ocr_success", chars_extracted=len(extracted_text), language=detected_lang)
            
            # 7. Trigger next pipeline stage
            embed_document.delay(str(document_version_id))

        except Exception as e:
            log.error("ocr_pipeline_failed", error=str(e), exc_info=True)
            doc.pipeline_status = DocumentPipelineStatus.FAILED
            session.add(doc)
            session.commit()
        
        finally:
            # Cleanup secure temporary file
            if 'temp_path' in locals() and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError as cleanup_error:
                    log.warning("temp_file_cleanup_failed", error=str(cleanup_error))

    return {
        "status": "completed", 
        "document_id": document_version_id, 
        "language": doc.language,
        "is_scan": scanned_pages_count > 0
    }