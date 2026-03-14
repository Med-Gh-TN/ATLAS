import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# DEFENSIVE ARCHITECTURE: Graceful Degradation
# WeasyPrint requires native OS C-libraries (GTK3, Pango). 
# If they are missing (common on Windows), we catch the OSError so 
# the rest of the application (Auth, Upload, RAG) can still boot.
# -------------------------------------------------------------------
try:
    from weasyprint import HTML, CSS
except (ImportError, OSError) as e:
    logger.warning(f"WeasyPrint OS dependencies missing ({e}). PDF export feature is gracefully disabled.")
    HTML = None
    CSS = None

from app.models.study_tools import Summary, SummaryFormat

# Minimal, professional CSS for academic PDF exports
BASE_CSS = """
body { 
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; 
    line-height: 1.6; 
    color: #333; 
    margin: 2cm; 
}
h1 { 
    color: #2c3e50; 
    border-bottom: 2px solid #eee; 
    padding-bottom: 0.5rem; 
}
h2 { 
    color: #34495e; 
    margin-top: 1.5rem; 
}
ul { 
    margin-bottom: 1rem; 
}
li { 
    margin-bottom: 0.5rem; 
}
.diff-added { 
    color: #27ae60; 
}
.diff-removed { 
    color: #e74c3c; 
    text-decoration: line-through; 
}
.diff-modified { 
    color: #f39c12; 
}
"""

def _build_html_executive(content: Dict[str, Any], lang: str) -> str:
    bullets = content.get("bullets", [])
    title = "Résumé Exécutif" if lang == "fr" else "Executive Summary"
    items = "".join([f"<li>{b}</li>" for b in bullets])
    return f"<h1>{title}</h1><ul>{items}</ul>"


def _build_html_structured(content: Dict[str, Any], lang: str) -> str:
    title = content.get("title", "Résumé Structuré" if lang == "fr" else "Structured Summary")
    html = f"<h1>{title}</h1>"
    for section in content.get("sections", []):
        html += f"<h2>{section.get('heading', '')}</h2><ul>"
        for pt in section.get("points", []):
            html += f"<li>{pt}</li>"
        html += "</ul>"
    return html


def _build_html_comparative(content: Dict[str, Any], lang: str) -> str:
    title = "Analyse Comparative" if lang == "fr" else "Comparative Analysis"
    html = f"<h1>{title}</h1>"
    
    added = content.get("added", [])
    if added:
        section_title = "Ajouts" if lang == "fr" else "Added"
        html += f"<h2>{section_title}</h2><ul class='diff-added'>"
        html += "".join([f"<li>{item}</li>" for item in added])
        html += "</ul>"
        
    removed = content.get("removed", [])
    if removed:
        section_title = "Suppressions" if lang == "fr" else "Removed"
        html += f"<h2>{section_title}</h2><ul class='diff-removed'>"
        html += "".join([f"<li>{item}</li>" for item in removed])
        html += "</ul>"
        
    modified = content.get("modified", [])
    if modified:
        section_title = "Modifications" if lang == "fr" else "Modified"
        html += f"<h2>{section_title}</h2><ul class='diff-modified'>"
        html += "".join([f"<li>{item}</li>" for item in modified])
        html += "</ul>"
        
    return html


def generate_pdf_from_summary(summary: Summary) -> bytes:
    """
    US-18: Converts a structured Summary database object into a high-resolution PDF.
    Requires WeasyPrint OS-level dependencies (Pango, Cairo) installed on the host/container.
    """
    if HTML is None or CSS is None:
        logger.error("WeasyPrint is not installed or missing OS dependencies. PDF generation aborted.")
        raise NotImplementedError("PDF export requires native OS libraries (GTK3/Pango) which are not installed on this host.")

    try:
        html_content = ""
        if summary.format == SummaryFormat.EXECUTIVE:
            html_content = _build_html_executive(summary.content, summary.target_lang)
        elif summary.format == SummaryFormat.STRUCTURED:
            html_content = _build_html_structured(summary.content, summary.target_lang)
        elif summary.format == SummaryFormat.COMPARATIVE:
            html_content = _build_html_comparative(summary.content, summary.target_lang)
        else:
            html_content = "<h1>Format de résumé non pris en charge</h1>"

        # Wrap in basic HTML5 boilerplate
        full_html = f"""
        <!DOCTYPE html>
        <html lang="{summary.target_lang}">
        <head>
            <meta charset="UTF-8">
            <title>Export PDF - ATLAS</title>
        </head>
        <body>
            {html_content}
        </body>
        </html>
        """
        
        # Generate PDF bytes
        pdf_bytes = HTML(string=full_html).write_pdf(stylesheets=[CSS(string=BASE_CSS)])
        return pdf_bytes

    except Exception as e:
        logger.error(f"Failed to generate PDF for Summary {summary.id}: {str(e)}")
        raise