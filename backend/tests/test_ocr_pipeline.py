"""
US-07: Multilingual OCR Pipeline Test Suite
Tests 10 representative scenarios (Digital, Scanned, Mixed AR/FR, Degraded, Handwriting).
"""
import pytest
import uuid
from unittest.mock import MagicMock, patch
from app.services.ocr_tasks import process_document_ocr
from app.models.all_models import DocumentVersion, Contribution, DocumentPipelineStatus

@pytest.fixture
def mock_db_session():
    with patch("app.services.ocr_tasks.Session") as mock_session_class:
        mock_session = MagicMock()
        mock_session_class.return_value.__enter__.return_value = mock_session
        yield mock_session

@pytest.fixture
def mock_boundaries():
    with patch("app.services.ocr_tasks.minio_client") as minio, \
         patch("app.services.ocr_tasks._scan_file_with_clamav", return_value=True), \
         patch("app.services.ocr_tasks.embed_document.delay") as embed_task, \
         patch("app.services.ocr_tasks.notify_admin_degraded_scan.delay") as notify_task, \
         patch("app.services.ocr_tasks.os.remove"):
        yield {"minio": minio, "embed": embed_task, "notify": notify_task}

CORPUS_SCENARIOS = [
    {"id": "digital_fr", "ext": ".pdf", "pdf_txt": "Document numérique propre en français avec suffisamment de texte.", "ocr_txt": "", "var": 0.0, "lang": "fr", "scan": False, "flag": False},
    # ARCHITECTURAL FIX: String length extended to 70 characters to bypass the 50-character OCR density heuristic.
    {"id": "digital_ar", "ext": ".pdf", "pdf_txt": "هذا مستند رقمي نظيف باللغة العربية مع نص كافٍ جداً لتجاوز الحد الأدنى.", "ocr_txt": "", "var": 0.0, "lang": "ar", "scan": False, "flag": False},
    {"id": "digital_mixed", "ext": ".pdf", "pdf_txt": "Intro en français. مقدمة باللغة العربية. Suite du texte.", "ocr_txt": "", "var": 0.0, "lang": "fr", "scan": False, "flag": False},
    {"id": "scan_fr", "ext": ".pdf", "pdf_txt": "", "ocr_txt": "Ceci est un texte extrait via l'OCR d'un scan de haute qualité.", "var": 500.0, "lang": "fr", "scan": True, "flag": False},
    {"id": "scan_ar", "ext": ".pdf", "pdf_txt": " ", "ocr_txt": "هذا نص مستخرج عبر التعرف الضوئي من مسح ضوئي عالي الجودة.", "var": 600.0, "lang": "ar", "scan": True, "flag": False},
    {"id": "scan_mixed", "ext": ".pdf", "pdf_txt": "", "ocr_txt": "Texte français. نص عربي. Quality scan mixed.", "var": 550.0, "lang": "fr", "scan": True, "flag": False},
    {"id": "degraded_fr", "ext": ".pdf", "pdf_txt": "", "ocr_txt": "Texte flou partiellement illisible de longueur suffisante.", "var": 30.0, "lang": "fr", "scan": True, "flag": True},
    {"id": "degraded_ar", "ext": ".pdf", "pdf_txt": "", "ocr_txt": "هذا نص عربي غير واضح ومقروء بصعوبة بسبب رداءة المسح الضوئي لتجاوز الحد.", "var": 25.0, "lang": "ar", "scan": True, "flag": True},
    {"id": "handwriting_ar", "ext": ".pdf", "pdf_txt": "", "ocr_txt": "مخطوط", "var": 200.0, "lang": "en", "scan": True, "flag": False, "hook": "Heavy Arabic Handwriting Fallback Hook Triggered"},
    {"id": "direct_image_jpg", "ext": ".jpg", "pdf_txt": None, "ocr_txt": "Texte provenant d'une image directe au lieu d'un PDF.", "var": 300.0, "lang": "fr", "scan": True, "flag": False}
]

@pytest.mark.parametrize("scenario", CORPUS_SCENARIOS, ids=[s["id"] for s in CORPUS_SCENARIOS])
def test_ocr_pipeline_corpus(scenario, mock_db_session, mock_boundaries):
    doc_id, contrib_id = uuid.uuid4(), uuid.uuid4()
    
    mock_doc = DocumentVersion(id=doc_id, contribution_id=contrib_id, storage_path=f"quarantine/test{scenario['ext']}", version_number=1, pipeline_status=DocumentPipelineStatus.QUEUED)
    mock_contrib = Contribution(id=contrib_id, title="Test Contribution", quality_flag=False)
    
    mock_db_session.get.side_effect = lambda m, i: mock_doc if m == DocumentVersion else (mock_contrib if m == Contribution else None)
    mock_db_session.exec.return_value.first.return_value = None

    with patch("app.services.ocr_tasks.pdfplumber.open") as mock_pdf, \
         patch("app.services.ocr_tasks.cv2.imread"), \
         patch("app.services.ocr_tasks.cv2.cvtColor"), \
         patch("app.services.ocr_tasks.cv2.Laplacian") as mock_laplacian, \
         patch("app.services.ocr_tasks.get_ocr_engine"), \
         patch("app.services.ocr_tasks._parse_ocr_result") as mock_parse:
         
        mock_page = MagicMock()
        mock_page.extract_text.return_value = scenario["pdf_txt"]
        mock_pdf.return_value.__enter__.return_value.pages = [mock_page]
        mock_laplacian.return_value.var.return_value = scenario["var"]
        mock_parse.return_value = scenario["ocr_txt"]
        
        result = process_document_ocr(str(doc_id))
        
        assert result["status"] == "completed"
        assert result["is_scan"] == scenario["scan"]
        assert mock_doc.pipeline_status == DocumentPipelineStatus.EMBEDDING
        
        if scenario["lang"] in ["fr", "ar", "en"]:
            assert mock_doc.language == scenario["lang"]
            
        if "hook" in scenario:
            assert scenario["hook"] in mock_doc.ocr_text
            
        if scenario["flag"]:
            assert mock_contrib.quality_flag is True
            mock_boundaries["notify"].assert_called_once()
        else:
            assert mock_contrib.quality_flag is False
            mock_boundaries["notify"].assert_not_called()
        
        mock_boundaries["embed"].assert_called_once_with(str(doc_id))