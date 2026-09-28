from typing import Dict, Any, Optional, List
from app.core.config import settings
from app.core.logging import logger

class VapiClient:
    def __init__(self):
        self.api_key = settings.VAPI_API_KEY
        self.assistant_id = settings.VAPI_ASSISTANT_ID

    async def create_call(self, phone_number: str, context: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"[Voice Agent / Vapi] Simulated call to {phone_number} with context keys: {list(context.keys())}")
        return {
            "id": f"vapi_{context.get('call_type', 'call')}_sim",
            "status": "completed",
            "provider": "vapi",
        }

vapi_client = VapiClient()
