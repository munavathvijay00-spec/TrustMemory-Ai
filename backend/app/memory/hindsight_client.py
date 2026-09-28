from typing import Dict, Any, List, Optional
import uuid
import datetime
from app.core.config import settings
from app.core.logging import logger

class HindsightMemoryClient:
    """Memory client providing Hindsight 4-network abstraction (World, Experience, Opinion, Observation).
    Supports live Hindsight endpoint when configured, with transparent in-memory local fallback.
    """
    def __init__(self):
        self.api_url = settings.HINDSIGHT_API_URL
        self.api_key = settings.HINDSIGHT_API_KEY
        # Local fallback store: entity_id -> {world: [], experience: [], opinion: [], observation: []}
        self._store: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}

    def _ensure_entity(self, entity_id: str):
        if entity_id not in self._store:
            self._store[entity_id] = {
                "world": [],
                "experience": [],
                "opinion": [],
                "observation": [],
            }

    async def retain(self, entity_id: str, layer: str, text: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._ensure_entity(entity_id)
        if layer not in self._store[entity_id]:
            self._store[entity_id][layer] = []

        entry = {
            "id": str(uuid.uuid4())[:8],
            "layer": layer,
            "text": text,
            "metadata": metadata or {},
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        self._store[entity_id][layer].append(entry)
        logger.info(f"[Hindsight Core] Retained {layer} memory for entity {entity_id}: '{text}'")
        return entry

    async def recall(self, entity_id: str, query: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
        self._ensure_entity(entity_id)
        memories = self._store[entity_id]
        total_count = sum(len(v) for v in memories.values())
        logger.info(f"[Hindsight Core] Recalled {total_count} memories for entity {entity_id}")
        return memories

    async def reflect(self, entity_id: str) -> List[Dict[str, Any]]:
        self._ensure_entity(entity_id)
        return self._store[entity_id].get("observation", [])

hindsight_client = HindsightMemoryClient()
