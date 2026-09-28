from typing import Optional, List, Dict, Any
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings
from app.core.logging import logger

class EmailAlertService:
    def __init__(self):
        self.username = settings.GOOGLEUSER
        self.password = settings.GMAIL_APP_PASSWORD
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.coordinator_email = settings.COORDINATOR_ALERT_EMAIL or self.username

    def is_configured(self) -> bool:
        return bool(self.username and self.password and self.password != "abcdefghijklmnop")

    async def send_alert_email(
        self,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
        recipient: Optional[str] = None,
    ) -> bool:
        to_email = recipient or self.coordinator_email
        if not to_email:
            logger.warning("[Email Service] No recipient email configured.")
            return False

        if not self.is_configured():
            logger.info(
                f"[Email Service (Simulation)] Email '{subject}' would be dispatched to {to_email}. "
                "Configure GOOGLEUSER and GMAIL_APP_PASSWORD in backend/.env to send live emails via Gmail SMTP."
            )
            return True

        clean_pwd = (self.password or "").replace(" ", "").strip()
        from_email = (self.username or "").strip()

        logger.info(f"[Email Service] Attempting to send OTP email to {to_email} via {self.host}:{self.port} with user {from_email}...")

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[{settings.PROJECT_NAME}] {subject}"
            msg["From"] = from_email
            msg["To"] = to_email

            part1 = MIMEText(body_text, "plain")
            msg.attach(part1)

            if body_html:
                part2 = MIMEText(body_html, "html")
                msg.attach(part2)

            with smtplib.SMTP(self.host, self.port, timeout=12) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(from_email, clean_pwd)
                server.sendmail(from_email, [to_email], msg.as_string())

            logger.info(f"[Email Service] Live email successfully dispatched to {to_email}: '{subject}'")
            return True
        except Exception as e:
            logger.error(f"[Email Service] Failed to send email via Gmail SMTP: {e}")
            return False

    async def send_otp_email(self, recipient: str, otp_code: str, role: str = "user") -> Dict[str, Any]:
        subject = f"Your TrustMemory AI Verification Code: {otp_code}"
        body_text = (
            f"Welcome to TrustMemory AI.\n\n"
            f"You are registering as: {role.capitalize()}.\n"
            f"Your one-time verification code is: {otp_code}\n\n"
            "This code expires in 10 minutes.\n"
        )
        body_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 6px;">
            <h2 style="color: #1C2530; margin-bottom: 6px;">TrustMemory AI</h2>
            <p style="color: #555; font-size: 14px;">You are creating an account as <strong>{role.capitalize()}</strong>.</p>
            <div style="background: #F3E8D6; color: #8F6A2E; font-size: 28px; font-weight: bold; letter-spacing: 4px; padding: 14px; text-align: center; border-radius: 4px; margin: 20px 0;">
                {otp_code}
            </div>
            <p style="color: #777; font-size: 12px;">Enter this code on the registration screen to verify your email and retain your profile into Hindsight Core memory.</p>
        </div>
        """
        success = await self.send_alert_email(subject, body_text, body_html, recipient=recipient)
        return {"success": success, "otp": otp_code, "recipient": recipient}

email_service = EmailAlertService()
