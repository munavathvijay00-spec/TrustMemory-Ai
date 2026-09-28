from typing import Dict, Any, List, Optional
try:
    from sqlalchemy.ext.asyncio import AsyncSession
except ImportError:
    AsyncSession = Any
from app.memory.retain import retain_memory
from app.memory.recall import recall_memory
from app.memory.reflect import reflect_memory
from app.utils.formatting import role_label
from app.core.logging import logger

class MemoryService:
    def __init__(self, session: Optional[Any] = None):
        self.session = session
        if session is not None:
            from app.repositories.entity_repository import EntityRepository
            self.entity_repo = EntityRepository(session)
        else:
            self.entity_repo = None

    async def get_entity_memory(self, entity_id: str) -> Dict[str, List[Dict[str, Any]]]:
        return await recall_memory(entity_id=entity_id)

    async def count_entity_memories(self, entity_id: str) -> int:
        mem = await recall_memory(entity_id=entity_id)
        return sum(len(entries) for entries in mem.values())

    async def retain_fact(self, entity_id: str, layer: str, text: str, metadata: Optional[Dict[str, Any]] = None):
        return await retain_memory(entity_id=entity_id, layer=layer, text=text, metadata=metadata)

    async def initialize_helper_memory(
        self,
        helper_id: str,
        name: str,
        experience_years: int,
        location: str,
        availability: str,
        skills: List[str],
        background_note: Optional[str] = None,
        initial_memories: Optional[List[str]] = None,
    ):
        """Retains verified facts and background context into Hindsight World & Opinion networks."""
        # 1. World facts
        await retain_memory(
            helper_id,
            "world",
            f"{name} has {experience_years} years of verified professional experience.",
            {"entity_type": "helper", "category": "experience"}
        )
        await retain_memory(
            helper_id,
            "world",
            f"Skills & competencies: {', '.join([role_label(s) for s in skills])}.",
            {"entity_type": "helper", "category": "skills"}
        )
        await retain_memory(
            helper_id,
            "world",
            f"Based in {location}. Availability: {availability}.",
            {"entity_type": "helper", "category": "logistics"}
        )

        if background_note:
            await retain_memory(
                helper_id,
                "world",
                background_note,
                {"entity_type": "helper", "category": "background_note"}
            )

        # 2. Additional initial memories (e.g. prior household experience)
        if initial_memories:
            for item in initial_memories:
                await retain_memory(
                    helper_id,
                    "experience",
                    item,
                    {"entity_type": "helper", "source": "initial_onboarding"}
                )

        # 3. Opinion network baseline
        primary_skill = skills[0] if skills else "elder_care"
        await retain_memory(
            helper_id,
            "opinion",
            f"Candidate profile initialized. Primary role suitability: {role_label(primary_skill)}. Baseline Trust: 68/100, Churn Risk: 18/100.",
            {"entity_type": "helper", "category": "baseline_assessment"}
        )
        logger.info(f"[Hindsight Core] Successfully initialized 4-network memory for helper {name} ({helper_id})")

    async def initialize_household_memory(
        self,
        household_id: str,
        name: str,
        location: str,
        requirement: str,
        schedule: str,
        special_requirements: Optional[str] = None,
        initial_memories: Optional[List[str]] = None,
    ):
        """Retains residence profile, constraints, and preferences into Hindsight World network."""
        # 1. World facts
        await retain_memory(
            household_id,
            "world",
            f"{name} is located in {location}.",
            {"entity_type": "household", "category": "location"}
        )
        await retain_memory(
            household_id,
            "world",
            f"Current requirement: {role_label(requirement)}. Schedule: {schedule}.",
            {"entity_type": "household", "category": "requirement"}
        )

        if special_requirements:
            await retain_memory(
                household_id,
                "world",
                special_requirements,
                {"entity_type": "household", "category": "special_requirements"}
            )

        if initial_memories:
            for item in initial_memories:
                await retain_memory(
                    household_id,
                    "experience",
                    item,
                    {"entity_type": "household", "source": "initial_onboarding"}
                )

        # 2. Opinion network baseline
        await retain_memory(
            household_id,
            "opinion",
            "Initial household profile established; baseline placement difficulty assessed at 20/100.",
            {"entity_type": "household", "difficulty": 20}
        )
        logger.info(f"[Hindsight Core] Successfully initialized 4-network memory for household {name} ({household_id})")

    async def ensure_world_memory(self, entity_id: str):
        helper = await self.entity_repo.get_helper(entity_id)
        if helper:
            await self.initialize_helper_memory(
                helper_id=helper.id,
                name=helper.name,
                experience_years=helper.experience_years,
                location=helper.location,
                availability=helper.availability,
                skills=helper.skills,
            )
            return

        hh = await self.entity_repo.get_household(entity_id)
        if hh:
            await self.initialize_household_memory(
                household_id=hh.id,
                name=hh.name,
                location=hh.location,
                requirement=hh.requirement,
                schedule=hh.schedule,
            )
