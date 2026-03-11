import smtplib
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

# Initialize logging for monitoring mail delivery status
logger = logging.getLogger(__name__)

def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    Sends an email using the SMTP configuration defined in settings.
    Utilizes TLS for secure communication with Gmail.
    """
    # Defensive check: Ensure credentials are present before attempting connection
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.error("Email Service: SMTP credentials missing in environment configuration.")
        return False

    # Construct the MIME message
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    message["To"] = to_email

    # Attach the HTML body
    part = MIMEText(html_content, "html")
    message.attach(part)

    try:
        # Establish a secure connection to Gmail SMTP
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            if settings.SMTP_TLS:
                server.starttls()  # Upgrade connection to secure TLS
            
            # Authenticate using Google App Password
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            
            # Send the email
            server.sendmail(
                settings.EMAILS_FROM_EMAIL, 
                [to_email], 
                message.as_string()
            )
            
        logger.info(f"Email sent successfully to {to_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error("Email Service: Authentication failed. Verify Google App Password.")
    except smtplib.SMTPException as e:
        logger.error(f"Email Service: SMTP error occurred: {str(e)}")
    except Exception as e:
        logger.error(f"Email Service: Unexpected error during email dispatch: {str(e)}")
    
    return False


def send_otp_email(to_email: str, otp_code: str) -> bool:
    """
    Constructs a stylized HTML template for the OTP verification code.
    Matches the 'Silicon Valley' aesthetic of the platform.
    """
    subject = f"{otp_code} is your ATLAS verification code"
    
    # Stylized HTML Email Body
    html = f"""
    <html>
        <body style="font-family: sans-serif; color: #171717; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e5; border-radius: 8px;">
                <h2 style="color: #000; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">ATLAS Verification</h2>
                <p>Hello,</p>
                <p>To secure your account, please use the following One-Time Password (OTP) to complete your verification:</p>
                <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-radius: 6px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000;">{otp_code}</span>
                </div>
                <p style="font-size: 14px; color: #737373;">
                    This code will expire in {settings.OTP_EXPIRE_MINUTES} minutes. 
                    If you did not request this code, please ignore this email.
                </p>
                <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
                <p style="font-size: 12px; color: #a3a3a3; text-align: center;">
                    &copy; {datetime.now().year} ATLAS Platform. Built for Sfax CS Students.
                </p>
            </div>
        </body>
    </html>
    """
    
    return send_email(to_email=to_email, subject=subject, html_content=html)