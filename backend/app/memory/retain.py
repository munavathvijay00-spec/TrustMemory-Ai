from typing import Optional, Dict, Any
from app.memory.hindsight_client import hindsight_client

async def retain_memory(entity_id: str, layer: str, text: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Retain memory entry into one of the 4 networks: world, experience, opinion, observation."""
    return await hindsight_client.retain(entity_id=entity_id, layer=layer, text=text, metadata=metadata)
