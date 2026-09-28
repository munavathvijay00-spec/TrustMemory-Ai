from typing import Dict, Any
from app.core.logging import logger

async def process_voice_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handles incoming webhooks from Vapi or Bland (e.g. call end, transcript ready)."""
    logger.info(f"[Voice Webhook] Processing event: {payload.get('type', 'call_end')}")
    return {"status": "received", "event": payload.get("type", "unknown")}
