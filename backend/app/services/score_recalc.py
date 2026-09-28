from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.event_repository import EventRepository
from app.repositories.score_repository import ScoreRepository
from app.services.scoring_service import calculate_trust, calculate_churn, calculate_difficulty, churn_why
from app.core.logging import logger

class ScoreRecalcService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.event_repo = EventRepository(session)
        self.score_repo = ScoreRepository(session)

    async def recalc_helper(self, helper_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        events = await self.event_repo.list_helper_events(helper_id)
        trust = calculate_trust(events)
        churn = calculate_churn(events)

        await self.score_repo.upsert_score(
            entity_id=helper_id,
            entity_type="helper",
            trust=trust,
            churn=churn,
        )
        await self.score_repo.record_history(
            entity_id=helper_id,
            entity_type="helper",
            trust=trust,
            churn=churn,
            reason=reason or "recalculation",
        )
        why = churn_why(events, churn)
        logger.info(f"[Decision Agent] Recalculated scores for helper {helper_id}: Trust={trust}, Churn={churn}")
        return {"trust": trust, "churn": churn, "why": why}

    async def recalc_household(self, household_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        events = await self.event_repo.list_household_events(household_id)
        difficulty = calculate_difficulty(events)

        await self.score_repo.upsert_score(
            entity_id=household_id,
            entity_type="household",
            difficulty=difficulty,
        )
        await self.score_repo.record_history(
            entity_id=household_id,
            entity_type="household",
            difficulty=difficulty,
            reason=reason or "recalculation",
        )
        logger.info(f"[Decision Agent] Recalculated score for household {household_id}: Difficulty={difficulty}")
        return {"difficulty": difficulty}
