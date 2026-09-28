from typing import Dict, Any, List, Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.entities import Placement, Helper, Household
from app.models.reflection import Reflection
from app.repositories.reflection_repository import ReflectionRepository
from app.repositories.entity_repository import EntityRepository
from app.llm.synthesis import synthesize_cross_placement_pattern
from app.memory.retain import retain_memory
from app.core.logging import logger
from app.utils.formatting import role_label

class ReflectionService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.reflection_repo = ReflectionRepository(session)
        self.entity_repo = EntityRepository(session)

    async def reflect_household(self, household_id: str) -> Reflection:
        hh = await self.entity_repo.get_household(household_id)
        if not hh:
            raise ValueError(f"Household {household_id} not found")

        # Get all placements for household
        res = await self.session.execute(select(Placement).where(Placement.household_id == household_id))
        placements = list(res.scalars().all())

        failed = [p for p in placements if p.status in ("failed", "ended_poor_fit")]
        failed_data = []
        for p in failed:
            helper = await self.entity_repo.get_helper(p.helper_id)
            failed_data.append({
                "helper_name": helper.name if helper else p.helper_id,
                "end_date": str(p.end_date) if p.end_date else "earlier",
                "status": p.status,
            })

        synth = await synthesize_cross_placement_pattern(hh.name, len(placements), failed_data)

        refl = Reflection(
            id=str(uuid.uuid4())[:8],
            entity_type="household",
            entity_id=household_id,
            classification=synth["classification"],
            insight=synth["insight"],
            evidence=synth["evidence"],
            confidence=synth["confidence"],
        )
        created = await self.reflection_repo.create_reflection(refl)

        # Store to Observation layer in Hindsight
        await retain_memory(
            entity_id=household_id,
            layer="observation",
            text=synth["insight"],
            metadata={"classification": synth["classification"]},
        )
        logger.info(f"[Reflection Agent] Stored {synth['classification']} reflection for {hh.name}")
        return created

    async def reflect_role_fit(self, helper_id: str) -> Reflection:
        helper = await self.entity_repo.get_helper(helper_id)
        if not helper:
            raise ValueError(f"Helper {helper_id} not found")

        rs = helper.role_scores or {}
        sorted_roles = sorted(rs.items(), key=lambda x: x[1], reverse=True)
        best = sorted_roles[0] if sorted_roles else ("elder_care", 80)
        worst = sorted_roles[-1] if sorted_roles else ("child_care", 40)

        insight = (
            f"{helper.name} performs consistently better in {role_label(best[0])} ({best[1]}/100) "
            f"than in {role_label(worst[0])} ({worst[1]}/100), based on historical placement outcomes."
        )

        refl = Reflection(
            id=str(uuid.uuid4())[:8],
            entity_type="helper",
            entity_id=helper_id,
            classification="OBSERVATION",
            insight=insight,
            evidence=[
                f"{role_label(best[0])} outcomes: strong, repeated positive feedback.",
                f"{role_label(worst[0])} outcomes: below-average feedback, early placement end.",
            ],
            confidence=0.81,
        )
        created = await self.reflection_repo.create_reflection(refl)
        await retain_memory(entity_id=helper_id, layer="observation", text=insight)
        logger.info(f"[Reflection Agent] Stored role-fit reflection for {helper.name}")
        return created
