import base64
import urllib.request
import urllib.parse
import json
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging import logger

class TwilioClient:
    def __init__(self):
        self.account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', None)
        self.auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', None)
        self.from_phone = getattr(settings, 'TWILIO_PHONE_NUMBER', None)

    async def make_call(self, phone_number: str, first_sentence: str) -> Dict[str, Any]:
        if not self.account_sid or not self.auth_token or not self.from_phone:
            logger.warning(f"[Voice Agent / Twilio] Credentials not set. Simulated call to {phone_number}.")
            return {"status": "simulated", "message": "Twilio credentials not configured."}

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Calls.json"
        clean_phone = "".join(ch for ch in phone_number if ch.isdigit() or ch == '+')
        if not clean_phone.startswith('+') and len(clean_phone) == 10:
            clean_phone = "+91" + clean_phone

        twiml = f"<Response><Say language='en-IN' voice='Polly.Aditi'>{first_sentence}</Say></Response>"
        data = urllib.parse.urlencode({
            "To": clean_phone,
            "From": self.from_phone,
            "Twiml": twiml
        }).encode("utf-8")

        auth_header = "Basic " + base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode("utf-8")).decode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": auth_header,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                logger.info(f"[Twilio Voice] Real outbound call initiated to {clean_phone}: SID {res.get('sid')}")
                return res
        except Exception as e:
            logger.error(f"[Twilio Voice] Error calling {clean_phone}: {e}")
            return {"status": "error", "error": str(e)}

twilio_client = TwilioClient()
