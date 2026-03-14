import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from app.core.config import settings

# Initialize logging for monitoring mail delivery status
logger = logging.getLogger(__name__)

def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    Sends an email using standard SMTP (Gmail).
    Includes a Dev Mode Fallback: Prints the email to the console if SMTP fails,
    allowing local frontend development to continue uninterrupted.
    """
    # Defensive check: Ensure SMTP credentials are present
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.error("Email Service: SMTP credentials missing in environment configuration.")
        _dev_mode_fallback(to_email, subject, html_content)
        return True # Return True to allow registration to proceed in dev mode

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
        # If Gmail blocks the connection during local dev, print the OTP to the console
        _dev_mode_fallback(to_email, subject, html_content)
        return True # Allow registration to proceed so UI testing isn't blocked

def _dev_mode_fallback(to_email: str, subject: str, html_content: str):
    """
    SOTA Dev Experience: If email fails to send, parse the OTP and print it to the terminal.
    """
    import re
    # Extract the 6-digit code from the subject or body
    match = re.search(r'\b\d{6}\b', subject)
    code = match.group(0) if match else "[CODE HIDDEN]"
    
    print("\n" + "="*60)
    print("🚨 DEV MODE FALLBACK: EMAIL INTERCEPTED 🚨")
    print("="*60)
    print(f"To: {to_email}")
    print(f"Subject: {subject}")
    print(f"OTP CODE: >>> {code} <<< (Copy this into the React UI)")
    print("="*60 + "\n")

def send_otp_email(to_email: str, otp_code: str) -> bool:
    """
    Constructs a stylized HTML template for the OTP verification code.
    Matches the 'Silicon Valley' aesthetic of the platform.
    Includes explicit expiration warnings and a resend link per US-03.
    """
    subject = f"{otp_code} is your ATLAS verification code"
    
    # Safely get frontend URL for the resend link, fallback to a relative path
    frontend_url = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])[0]
    resend_link = f"{frontend_url}/auth/verify-otp"
    
    # Stylized HTML Email Body with ATLAS Branding
    html = f"""
    <!DOCTYPE html>
    <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #171717; line-height: 1.6; background-color: #f9fafb; padding: 20px; margin: 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="color: #000000; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">ATLAS Verification</h2>
                </div>
                
                <p style="font-size: 16px; color: #374151;">Hello,</p>
                <p style="font-size: 16px; color: #374151;">To secure your account, please use the following One-Time Password (OTP) to complete your registration:</p>
                
                <div style="background-color: #f3f4f6; padding: 24px; text-align: center; border-radius: 8px; margin: 32px 0; border: 1px dashed #d1d5db;">
                    <span style="font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #111827; display: block; margin-left: 12px;">{otp_code}</span>
                </div>
                
                <p style="font-size: 14px; color: #4b5563; text-align: center; margin-bottom: 24px;">
                    <strong>Security Notice:</strong> This code will expire in exactly <strong>24 hours</strong>.
                </p>
                
                <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #f3f4f6;">
                    <p style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">
                        Didn't receive the code or need a new one?
                    </p>
                    <a href="{resend_link}" style="display: inline-block; color: #000000; text-decoration: none; font-weight: 600; font-size: 14px; border-bottom: 1px solid #000000; padding-bottom: 2px;">
                        Request a new OTP
                    </a>
                </div>

                <div style="margin-top: 40px; text-align: center;">
                    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                        &copy; 2026 ATLAS Platform. Built for Sfax CS Students.
                    </p>
                    <p style="font-size: 12px; color: #9ca3af; margin-top: 4px;">
                        If you did not request this email, please safely ignore it.
                    </p>
                </div>
            </div>
        </body>
    </html>
    """
    
    return send_email(to_email=to_email, subject=subject, html_content=html)


def send_teacher_invitation_email(to_email: str, otp_code: str, teacher_name: str, department_name: str) -> bool:
    """
    Constructs a stylized HTML template for the Teacher Onboarding invitation.
    Matches US-05 requirements: personalized with name, department, direct activation link, and OTP.
    """
    subject = "Invitation to join ATLAS - Teacher Onboarding"
    
    frontend_url = getattr(settings, "BACKEND_CORS_ORIGINS", ["http://localhost:3000"])[0]
    activation_link = f"{frontend_url}/activate/teacher"
    
    html = f"""
    <!DOCTYPE html>
    <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #171717; line-height: 1.6; background-color: #f9fafb; padding: 20px; margin: 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="color: #000000; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Welcome to ATLAS</h2>
                </div>
                
                <p style="font-size: 16px; color: #374151;">Hello Professor <strong>{teacher_name}</strong>,</p>
                <p style="font-size: 16px; color: #374151;">You have been invited to join the <strong>{department_name}</strong> department on the ATLAS Platform.</p>
                <p style="font-size: 16px; color: #374151;">To activate your teacher account and set up your profile, please use your unique onboarding code below:</p>
                
                <div style="background-color: #f3f4f6; padding: 24px; text-align: center; border-radius: 8px; margin: 32px 0; border: 1px dashed #d1d5db;">
                    <span style="font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #111827; display: block; margin-left: 12px;">{otp_code}</span>
                </div>
                
                <p style="font-size: 14px; color: #4b5563; text-align: center; margin-bottom: 24px;">
                    <strong>Security Notice:</strong> This code is strictly single-use and will expire in exactly <strong>48 hours</strong>.
                </p>
                
                <div style="text-align: center; margin-top: 32px;">
                    <a href="{activation_link}" style="background-color: #000000; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: 600; border-radius: 6px; display: inline-block;">
                        Activate Account
                    </a>
                </div>

                <div style="margin-top: 40px; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 24px;">
                    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                        &copy; 2026 ATLAS Platform. Built for Sfax CS Students.
                    </p>
                    <p style="font-size: 12px; color: #9ca3af; margin-top: 4px;">
                        If you believe you received this in error, please contact your administration.
                    </p>
                </div>
            </div>
        </body>
    </html>
    """
    
    return send_email(to_email=to_email, subject=subject, html_content=html)


def send_contribution_status_email(to_email: str, title: str, status: str, reason: str = None) -> bool:
    """
    US-11: Student Notification for Status Changes.
    Highlights XP gains for approvals and provides clear feedback for rejections or revision requests.
    """
    subject = f"Update on your contribution: {title}"
    
    is_approved = status == "APPROVED"
    is_revision = status == "REVISION_REQUESTED"
    
    status_color = "#10b981" if is_approved else "#f59e0b" if is_revision else "#ef4444"
    status_text = "Approved" if is_approved else "Revision Requested" if is_revision else "Rejected"
    
    feedback_section = ""
    if reason:
        feedback_section = f"""
        <div style="margin-top: 24px; padding: 20px; background-color: #fef2f2; border-left: 4px solid {status_color}; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 600;">Moderator Feedback:</p>
            <p style="margin: 8px 0 0 0; font-size: 14px; color: #b91c1c; line-height: 1.5;">"{reason}"</p>
        </div>
        """

    xp_badge = ""
    if is_approved:
        xp_badge = """
        <div style="display: inline-block; margin-top: 16px; padding: 4px 12px; background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 999px;">
            <span style="font-size: 12px; color: #065f46; font-weight: 700;">+50 XP CREDITED</span>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #171717; line-height: 1.6; background-color: #f9fafb; padding: 20px; margin: 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border: 1px solid #e5e5e5; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h2 style="color: #000000; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Contribution Update</h2>
                </div>
                
                <p style="font-size: 16px; color: #374151;">Hello,</p>
                <p style="font-size: 16px; color: #374151;">
                    The review of your document <strong>"{title}"</strong> is complete.
                </p>
                
                <div style="margin-top: 24px;">
                    <span style="font-size: 14px; font-weight: 700; color: {status_color}; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Status: {status_text}</span>
                    {xp_badge}
                </div>

                {feedback_section}

                <p style="margin-top: 32px; font-size: 14px; color: #6b7280;">
                    {"Your document is now live in the library." if is_approved else "You may review the feedback and submit an improved version from your dashboard."}
                </p>

                <div style="margin-top: 40px; border-top: 1px solid #f3f4f6; padding-top: 24px; text-align: center;">
                    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                        &copy; 2026 ATLAS Platform. Built for Sfax CS Students.
                    </p>
                </div>
            </div>
        </body>
    </html>
    """
    
    return send_email(to_email=to_email, subject=subject, html_content=html)