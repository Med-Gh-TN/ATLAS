
import logging
import smtplib
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, select_autoescape, TemplateNotFound

from app.core.config import settings

# Initialize logging for monitoring mail delivery status
logger = logging.getLogger(__name__)

# ==========================================
# TEMPLATE ENVIRONMENT INITIALIZATION
# ==========================================
try:
    template_env = Environment(
        loader=FileSystemLoader(searchpath=settings.TEMPLATES_DIR),
        autoescape=select_autoescape(['html', 'xml'])
    )
    logger.info(f"Email Service: Jinja2 environment initialized at {settings.TEMPLATES_DIR}")
except Exception as e:
    logger.error(f"Email Service: Failed to initialize Jinja2 environment. Error: {e}")
    template_env = None


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    Sends an email using standard SMTP (Gmail).
    STRICT MODE ENFORCED: No silent fallbacks if credentials fail.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.error("Email Service: SMTP credentials missing in environment configuration.")
        _dev_mode_fallback(to_email, subject, html_content)
        return False # Hard fail if no config

    try:
        # Construct the MIME message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL or settings.SMTP_USER}>"
        msg['To'] = to_email
        
        # Attach HTML content
        part = MIMEText(html_content, 'html')
        msg.attach(part)
        
        # Connect to Gmail SMTP Server (Port 587 with TLS)
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        
        # Dispatch email
        server.sendmail(msg['From'], [to_email], msg.as_string())
        server.quit()
        
        logger.info(f"Email sent successfully via SMTP to {to_email}.")
        return True

    except Exception as e:
        # CRITICAL FIX: We log the error loudly and return False. 
        # We no longer pretend the email sent successfully.
        logger.error(f"Email Service: SMTP error occurred during dispatch: {str(e)}")
        _dev_mode_fallback(to_email, subject, html_content)
        return False


def _dev_mode_fallback(to_email: str, subject: str, html_content: str):
    """
    Prints the email payload to the console for debugging purposes.
    """
    match_otp = re.search(r'\b\d{6}\b', subject)
    match_token = re.search(r'token=([A-Za-z0-9_-]+)', html_content)
    
    print("\n" + "="*60)
    print("🚨 DEV MODE FALLBACK: EMAIL INTERCEPTED 🚨")
    print("="*60)
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    
    if match_token:
        print(f"MAGIC LINK TOKEN: >>> {match_token.group(1)} <<<")
        print(f"FULL URL: http://localhost:3000/auth/activate/teacher?token={match_token.group(1)}")
    elif match_otp:
        print(f"OTP CODE: >>> {match_otp.group(0)} <<<")
    else:
        print("CONTENT: [Code/Token Hidden - Check HTML Body]")
        
    print("="*60 + "\n")


def send_otp_email(to_email: str, otp_code: str) -> bool:
    if not template_env:
        return False

    subject = f"{otp_code} is your ATLAS verification code"
    frontend_url = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])[0]
    resend_link = f"{frontend_url}/auth/verify-otp"
    
    ttl_hours = settings.OTP_EXPIRE_MINUTES // 60
    ttl_display = f"{ttl_hours} hours" if ttl_hours >= 1 else f"{settings.OTP_EXPIRE_MINUTES} minutes"
    
    try:
        template = template_env.get_template("otp_verification.html")
        html_content = template.render(
            otp_code=otp_code,
            ttl_display=ttl_display,
            resend_link=resend_link,
            current_year=datetime.now().year
        )
        return send_email(to_email=to_email, subject=subject, html_content=html_content)
    except Exception as e:
        logger.error(f"Email Service: Error rendering OTP template: {e}")
        return False


def send_teacher_invitation_email(to_email: str, otp_code: str, teacher_name: str, department_name: str) -> bool:
    if not template_env:
        return False

    subject = "Invitation to join ATLAS - Teacher Onboarding"
    invite_token = otp_code
    frontend_url = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])[0]
    activation_link = f"{frontend_url}/auth/activate/teacher?token={invite_token}"
    
    try:
        template = template_env.get_template("teacher_invitation.html")
        html_content = template.render(
            teacher_name=teacher_name,
            department_name=department_name,
            activation_link=activation_link,
            current_year=datetime.now().year
        )
        return send_email(to_email=to_email, subject=subject, html_content=html_content)
    except Exception as e:
        logger.error(f"Email Service: Error rendering Teacher Invitation template: {e}")
        return False


def send_contribution_status_email(to_email: str, title: str, status: str, reason: str = None) -> bool:
    if not template_env:
        return False

    subject = f"Update on your contribution: {title}"
    
    try:
        template = template_env.get_template("contribution_status.html")
        html_content = template.render(
            title=title,
            status=status, 
            reason=reason,
            current_year=datetime.now().year
        )
        return send_email(to_email=to_email, subject=subject, html_content=html_content)
    except Exception as e:
        logger.error(f"Email Service: Error rendering Contribution Status template: {e}")
        return False


def send_admin_new_contribution_email(to_email: str, title: str, uploader_name: str) -> bool:
    if not template_env:
        return False

    subject = f"Action Required: New Contribution Pending Review - {title}"
    frontend_url = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])[0]
    moderation_link = f"{frontend_url}/superadmin/reports"
    
    try:
        template = template_env.get_template("admin_new_contribution.html")
        html_content = template.render(
            title=title,
            uploader_name=uploader_name,
            moderation_link=moderation_link,
            current_year=datetime.now().year
        )
        return send_email(to_email=to_email, subject=subject, html_content=html_content)
    except Exception as e:
        logger.error(f"Email Service: Error rendering Admin Contribution template: {e}")
        return False