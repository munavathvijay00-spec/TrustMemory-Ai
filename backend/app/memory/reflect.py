from typing import Dict, Any, List
from app.memory.hindsight_client import hindsight_client

async def reflect_memory(entity_id: str) -> List[Dict[str, Any]]:
    """Retrieve observations / synthesized patterns for an entity."""
    return await hindsight_client.reflect(entity_id=entity_id)
