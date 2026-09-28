from typing import Optional, Dict, Any, List
from app.memory.hindsight_client import hindsight_client

async def recall_memory(entity_id: str, query: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
    """Recall all 4 networks (world, experience, opinion, observation) for an entity."""
    return await hindsight_client.recall(entity_id=entity_id, query=query)
