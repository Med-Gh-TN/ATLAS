import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

try:
    from weasyprint import HTML, CSS
except (ImportError, OSError) as e:
    logger.warning(f"WeasyPrint OS dependencies missing ({e}). PDF export feature is gracefully disabled.")
    HTML = None
    CSS = None

REPORT_CSS = """
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
table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
}
th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
}
th {
    background-color: #3498db;
    color: white;
}
tr:nth-child(even) {
    background-color: #f9f9f9;
}
.summary-box {
    background-color: #ecf0f1;
    padding: 1rem;
    border-radius: 4px;
    margin: 1rem 0;
}
.stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin: 1rem 0;
}
.stat-item {
    background-color: #f8f9fa;
    padding: 1rem;
    border-radius: 4px;
    text-align: center;
}
.stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #2c3e50;
}
.stat-label {
    color: #7f8c8d;
    font-size: 0.9rem;
}
.footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
    text-align: center;
    color: #7f8c8d;
    font-size: 0.8rem;
}
"""


def generate_monthly_report_html(
    report_type: str,
    period: str,
    data: Dict[str, Any],
    lang: str = "en"
) -> str:
    titles = {
        "en": {"teacher": "Teacher Activity Report", "admin": "Admin Platform Report"},
        "fr": {"teacher": "Rapport d'activité enseignant", "admin": "Rapport de la plateforme admin"},
        "ar": {"teacher": "تقرير نشاط المعلم", "admin": "تقرير منصة المشرف"}
    }
    labels = {
        "en": {
            "generated": "Generated", "period": "Period", "overview": "Overview",
            "totalUploads": "Total Uploads", "approved": "Approved", "pending": "Pending",
            "rejected": "Rejected", "topCourses": "Top Courses", "noData": "No data available"
        },
        "fr": {
            "generated": "Généré", "period": "Période", "overview": "Aperçu",
            "totalUploads": "Total des téléchargements", "approved": "Approuvé",
            "pending": "En attente", "rejected": "Rejeté", "topCourses": "Meilleurs cours",
            "noData": "Aucune donnée disponible"
        },
        "ar": {
            "generated": "تم التوليد", "period": "الفترة", "overview": "نظرة عامة",
            "totalUploads": "إجمالي التحميلات", "approved": "موافق عليه",
            "pending": "قيد الانتظار", "rejected": "مرفوض", "topCourses": "أفضل الدورات",
            "noData": "لا توجد بيانات"
        }
    }

    l = labels.get(lang, labels["en"])
    title = titles.get(lang, titles["en"]).get(report_type, titles["en"][report_type])
    today = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    summary_html = ""
    if "summary" in data:
        s = data["summary"]
        summary_html = f"""
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-value">{s.get("total_uploads", s.get("total_users", 0))}</div>
                <div class="stat-label">{l["totalUploads"] if report_type == "teacher" else "Total Users"}</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">{s.get("approved_uploads", s.get("total_courses", 0))}</div>
                <div class="stat-label">{l["approved"] if report_type == "teacher" else "Total Courses"}</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">{s.get("pending_uploads", 0)}</div>
                <div class="stat-label">{l["pending"]}</div>
            </div>
        </div>
        """

    courses_html = ""
    if "top_courses" in data and data["top_courses"]:
        rows = "".join([
            f"<tr><td>{c.get('title', c.get('course_title', 'N/A'))}</td>"
            f"<td>{c.get('uploads', c.get('enrolled_students', 0))}</td>"
            f"<td>{c.get('approved_uploads', c.get('approved_contributions', 0))}</td></tr>"
            for c in data["top_courses"][:10]
        ])
        courses_html = f"""
        <h2>{l["topCourses"]}</h2>
        <table>
            <thead>
                <tr>
                    <th>Course</th>
                    <th>Uploads</th>
                    <th>Approved</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
        </table>
        """

    return f"""
    <!DOCTYPE html>
    <html lang="{lang}">
    <head>
        <meta charset="UTF-8">
        <title>{title} - ATLAS</title>
    </head>
    <body>
        <h1>{title}</h1>
        <div class="summary-box">
            <p><strong>{l["period"]}:</strong> {period}</p>
            <p><strong>{l["generated"]}:</strong> {today}</p>
        </div>
        <h2>{l["overview"]}</h2>
        {summary_html}
        {courses_html if courses_html else f'<p>{l["noData"]}</p>'}
        <div class="footer">
            ATLAS - {l["generated"]} by ATLAS Platform {datetime.utcnow().year}
        </div>
    </body>
    </html>
    """


def generate_analytics_pdf(
    report_type: str,
    period: str,
    data: Dict[str, Any],
    lang: str = "en"
) -> bytes:
    if HTML is None or CSS is None:
        raise NotImplementedError("PDF export requires WeasyPrint OS dependencies")

    html_content = generate_monthly_report_html(report_type, period, data, lang)
    return HTML(string=html_content).write_pdf(stylesheets=[CSS(string=REPORT_CSS)])