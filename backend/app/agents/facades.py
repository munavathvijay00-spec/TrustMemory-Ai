from typing import Dict, Any, List, Optional
from app.memory.retain import retain_memory
from app.memory.recall import recall_memory
from app.memory.reflect import reflect_memory
from app.llm.severity import classify_event_severity
from app.llm.synthesis import synthesize_cross_placement_pattern

class MemoryAgentFacade:
    async def retain(self, entity_id: str, layer: str, text: str, metadata: Optional[Dict[str, Any]] = None):
        return await retain_memory(entity_id=entity_id, layer=layer, text=text, metadata=metadata)

    async def recall(self, entity_id: str, query: Optional[str] = None):
        return await recall_memory(entity_id=entity_id, query=query)

    async def reflect(self, entity_id: str):
        return await reflect_memory(entity_id=entity_id)

class DecisionAgentFacade:
    async def classify_severity(self, event_type: str, description: Optional[str] = None):
        return await classify_event_severity(event_type=event_type, description=description)

class ReflectionAgentFacade:
    async def synthesize(self, household_name: str, placements_count: int, failed_placements: List[Dict[str, Any]]):
        return await synthesize_cross_placement_pattern(household_name, placements_count, failed_placements)

class MatchingAgentFacade:
    pass

memory_agent = MemoryAgentFacade()
decision_agent = DecisionAgentFacade()
reflection_agent = ReflectionAgentFacade()
matching_agent = MatchingAgentFacade()
