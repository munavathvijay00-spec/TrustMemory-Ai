import json
import urllib.request
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging import logger

class BlandClient:
    def __init__(self):
        self.api_key = settings.BLAND_API_KEY

    async def send_call(self, phone_number: str, task: str, first_sentence: Optional[str] = None) -> Dict[str, Any]:
        api_key = settings.BLAND_API_KEY
        if not api_key or api_key == "bland_mock_key" or api_key.startswith("mock"):
            logger.info(f"[Voice Agent / Bland] Running in simulation mode for {phone_number}. To make phone physically ring, configure BLAND_API_KEY in backend/.env")
            return {
                "call_id": "bland_sim_id",
                "status": "simulated",
                "provider": "bland",
                "message": "Simulated call. Configure BLAND_API_KEY or Twilio in backend/.env to physically ring this mobile number."
            }

        url = "https://api.bland.ai/v1/calls"
        clean_phone = "".join(ch for ch in phone_number if ch.isdigit() or ch == '+')
        if not clean_phone.startswith('+') and len(clean_phone) == 10:
            clean_phone = "+91" + clean_phone

        payload = {
            "phone_number": clean_phone,
            "task": task,
            "first_sentence": first_sentence or "Hi, this is a quick check-in from the agency. We noticed a couple of late arrivals recently — is everything alright?",
            "wait_for_greeting": True,
            "record": True,
            "voice": "maya",
            "model": "enhanced",
            "language": "en-IN"
        }
        headers = {
            "authorization": api_key,
            "Content-Type": "application/json"
        }

        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                logger.info(f"[Voice Agent / Bland] Real PSTN cellular call dispatched to {clean_phone}: {data}")
                return {
                    "call_id": data.get("call_id"),
                    "status": "dispatched",
                    "provider": "bland",
                    "details": data
                }
        except Exception as e:
            logger.error(f"[Voice Agent / Bland] Real phone call failed to connect: {e}")
            return {
                "status": "error",
                "error": str(e),
                "provider": "bland"
            }

bland_client = BlandClient()
