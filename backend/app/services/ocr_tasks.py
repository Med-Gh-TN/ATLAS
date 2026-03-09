
import os
import shutil
from celery import shared_task
from paddleocr import PaddleOCR
from sqlmodel import Session, select, create_engine
from app.core.config import settings
from app.models.all_models import DocumentVersion, DocumentPipelineStatus
from app.services.storage import minio_client

# Use a synchronous engine for Celery tasks
sync_engine = create_engine(settings.SQLALCHEMY_DATABASE_URI.replace("postgresql+asyncpg", "postgresql"))

# Initialize PaddleOCR (downloads model on first run)
# lang='fr' covers French and English mostly; for Arabic we might need 'ar' or separate passes
ocr = PaddleOCR(use_angle_cls=True, lang='fr', show_log=False) 

@shared_task(name="process_document_ocr")
def process_document_ocr(document_version_id: str):
    """
    1. Downloads file from MinIO to local temp.
    2. Runs PaddleOCR.
    3. Updates DB with extracted text.
    """
    print(f"[OCR] Starting for document: {document_version_id}")
    
    with Session(sync_engine) as session:
        # Fetch document record
        doc = session.get(DocumentVersion, document_version_id)
        if not doc:
            print(f"[OCR] Error: Document {document_version_id} not found.")
            return
        
        doc.pipeline_status = DocumentPipelineStatus.OCR_PROCESSING
        session.add(doc)
        session.commit()

        temp_path = f"temp_{document_version_id}.pdf" # Simplified for now
        
        try:
            # 1. Download from MinIO
            print(f"[OCR] Downloading {doc.storage_path}...")
            minio_client.client.fget_object(
                minio_client.bucket_name, 
                doc.storage_path, 
                temp_path
            )
            
            # 2. Run OCR
            print("[OCR] Running PaddleOCR...")
            # PaddleOCR works best on images, but supports PDF via conversion internally or external tools
            # For this MVP, we assume PaddleOCR handles it or we might need pdf2image.
            # Note: PaddleOCR().ocr() takes image_path. 
            # If PDF, we might need to convert first. 
            # For simplicity in Sprint 1, we try passing the file path directly.
            
            result = ocr.ocr(temp_path, cls=True)
            
            # Extract text
            extracted_text = ""
            if result:
                for idx in range(len(result)):
                    res = result[idx]
                    if res:
                        for line in res:
                            extracted_text += line[1][0] + "\n"
            
            # 3. Update DB
            doc.ocr_text = extracted_text
            doc.pipeline_status = DocumentPipelineStatus.READY # Skip Embedding for now (Sprint 1)
            session.add(doc)
            session.commit()
            print(f"[OCR] Success! Extracted {len(extracted_text)} chars.")

        except Exception as e:
            print(f"[OCR] Failed: {e}")
            doc.pipeline_status = DocumentPipelineStatus.FAILED
            session.add(doc)
            session.commit()
        
        finally:
            # Cleanup
            if os.path.exists(temp_path):
                os.remove(temp_path)

    return {"status": "completed", "document_id": document_version_id}
