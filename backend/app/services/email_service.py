import requests

from app.core.config import settings


def send_email(to_email: str, subject: str, html: str) -> bool:
    api_key = getattr(settings, "RESEND_API_KEY", None)
    from_email = getattr(settings, "RESEND_FROM_EMAIL", None)
    if not api_key or not from_email:
        return False

    r = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"from": from_email, "to": [to_email], "subject": subject, "html": html},
        timeout=15,
    )
    return 200 <= r.status_code < 300


def send_otp_email(to_email: str, otp_code: str) -> bool:
    html = f"<p>Your OTP code is: <strong>{otp_code}</strong></p>"
    return send_email(to_email=to_email, subject="ATLAS verification code", html=html)

