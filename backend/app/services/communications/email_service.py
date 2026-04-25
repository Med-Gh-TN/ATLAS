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
# Securely load Jinja2 templates using the absolute path defined in config.py.
# select_autoescape ensures dynamic text (like names or titles) cannot execute XSS payloads.
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
    Includes a Dev Mode Fallback: Prints the email to the console if SMTP fails,
    allowing local frontend development to continue uninterrupted.
    """
    # Defensive check: Ensure SMTP credentials are present
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("Email Service: SMTP credentials missing in environment configuration.")
        _dev_mode_fallback(to_email, subject, html_content)
        return True  # Return True to allow registration to proceed in dev mode

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
        logger.error(f"Email Service: SMTP error occurred during dispatch: {str(e)}")
        # If Gmail blocks the connection during local dev, print the payload to the console
        _dev_mode_fallback(to_email, subject, html_content)
        return True  # Allow registration to proceed so UI testing isn't blocked


def _dev_mode_fallback(to_email: str, subject: str, html_content: str):
    """
    SOTA Dev Experience: If email fails to send, parse the OTP or Token and print it to the terminal.
    """
    # Extract the 6-digit code from the subject or body
    match_otp = re.search(r'\b\d{6}\b', subject)
    # Extract token from the magic link
    match_token = re.search(r'token=([A-Za-z0-9_-]+)', html_content)

    print("\n" + "="*60)
    print("🚨 DEV MODE FALLBACK: EMAIL INTERCEPTED 🚨")
    print("="*60)
    print(f"To: {to_email}")
    print(f"Subject: {subject}")

    if match_token:
        print(f"MAGIC LINK TOKEN: >>> {match_token.group(1)} <<<")
        print(f"FULL URL: http://localhost:3000/activate/teacher?token={match_token.group(1)}")
    elif match_otp:
        print(f"OTP CODE: >>> {match_otp.group(0)} <<< (Copy this into the React UI)")
    else:
        print("CONTENT: [Code/Token Hidden - Check HTML Body]")

    print("="*60 + "\n")


def send_otp_email(to_email: str, otp_code: str) -> bool:
    """
    US-03: Dispatches the OTP verification email using the 'otp_verification.html' template.
    """
    if not template_env:
        logger.error("Email Service: Cannot send OTP. Template environment is offline.")
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

    except TemplateNotFound:
        logger.error("Email Service: Template 'otp_verification.html' not found in templates directory.")
        return False
    except Exception as e:
        logger.error(f"Email Service: Error rendering OTP template: {e}")
        return False


def send_teacher_invitation_email(to_email: str, otp_code: str, teacher_name: str, department_name: str) -> bool:
    """
    US-05 (Updated): Dispatches the Teacher Onboarding invitation using 'teacher_invitation.html'.
    """
    if not template_env:
        logger.error("Email Service: Cannot send invitation. Template environment is offline.")
        return False

    subject = "Invitation to join ATLAS - Teacher Onboarding"
    invite_token = otp_code
    frontend_url = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])[0]
    activation_link = f"{frontend_url}/activate/teacher?token={invite_token}"

    try:
        template = template_env.get_template("teacher_invitation.html")
        html_content = template.render(
            teacher_name=teacher_name,
            department_name=department_name,
            activation_link=activation_link,
            current_year=datetime.now().year
        )
        return send_email(to_email=to_email, subject=subject, html_content=html_content)

    except TemplateNotFound:
        logger.error("Email Service: Template 'teacher_invitation.html' not found.")
        return False
    except Exception as e:
        logger.error(f"Email Service: Error rendering Teacher Invitation template: {e}")
        return False


def send_contribution_status_email(to_email: str, title: str, status: str, reason: str = None) -> bool:
    """
    US-11: Student Notification for Status Changes using 'contribution_status.html'.
    """
    if not template_env:
        logger.error("Email Service: Cannot send status update. Template environment is offline.")
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

    except TemplateNotFound:
        logger.error("Email Service: Template 'contribution_status.html' not found.")
        return False
    except Exception as e:
        logger.error(f"Email Service: Error rendering Contribution Status template: {e}")
        return False


def send_admin_new_contribution_email(to_email: str, title: str, uploader_name: str) -> bool:
    """
    US-11: Alerts moderators of a new document using 'admin_new_contribution.html'.
    """
    if not template_env:
        logger.error("Email Service: Cannot send admin alert. Template environment is offline.")
        return False

    subject = f"Action Required: New Contribution Pending Review - {title}"
    frontend_url = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])[0]
    moderation_link = f"{frontend_url}/admin/moderation"

    try:
        template = template_env.get_template("admin_new_contribution.html")
        html_content = template.render(
            title=title,
            uploader_name=uploader_name,
            moderation_link=moderation_link,
            current_year=datetime.now().year
        )
        return send_email(to_email=to_email, subject=subject, html_content=html_content)

    except TemplateNotFound:
        logger.error("Email Service: Template 'admin_new_contribution.html' not found.")
        return False
    except Exception as e:
        logger.error(f"Email Service: Error rendering Admin Contribution template: {e}")
        return False