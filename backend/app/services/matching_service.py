from typing import List, Dict, Any, Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.entity_repository import EntityRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.reflection_repository import ReflectionRepository
from app.repositories.event_repository import EventRepository
from app.services.scoring_service import calculate_trust, calculate_churn
from app.utils.formatting import clamp, role_label
from app.models.reflection import StagedBackup
from app.core.logging import logger

class MatchingService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.entity_repo = EntityRepository(session)
        self.score_repo = ScoreRepository(session)
        self.event_repo = EventRepository(session)
        self.reflection_repo = ReflectionRepository(session)

    async def find_matches(self, role: str, household_id: str, naive: bool = False) -> List[Dict[str, Any]]:
        helpers = await self.entity_repo.list_helpers()
        results = []

        for h in helpers:
            events = await self.event_repo.list_helper_events(h.id)
            trust = calculate_trust(events)
            churn = calculate_churn(events)
            role_fit = (h.role_scores or {}).get(role, 40)

            if naive:
                loc_penalty = 0 if "Hyderabad" in h.location else 5
                score = int(clamp(round(50 + h.experience_years * 2 - loc_penalty), 0, 100))
            else:
                score = int(clamp(round(role_fit * 0.5 + trust * 0.3 + (100 - churn) * 0.2), 0, 100))

            why = []
            role_name = role_label(role)
            if role_fit >= 75:
                why.append(f"Consistently positive {role_name} outcomes on record.")
            if trust >= 75:
                why.append("Strong attendance and reliability history.")
            if churn <= 30:
                why.append("Low churn risk based on recent trend.")
            if not why:
                why.append("Best available balance of role fit, trust and stability among current candidates.")

            results.append({
                "helper": h,
                "score": score,
                "role_fit": role_fit,
                "trust": trust,
                "churn": churn,
                "why": why,
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        logger.info(f"[Matching Agent] Ranked {len(results)} candidates for household {household_id} (naive={naive})")
        return results

    async def ensure_backup_staged(self, household_id: str, at_risk_helper_id: str, churn_score: int) -> Optional[StagedBackup]:
        if churn_score < 75 or not household_id:
            return None

        existing = await self.reflection_repo.get_staged_backup(household_id)
        if existing:
            return existing

        household = await self.entity_repo.get_household(household_id)
        if not household:
            return None

        candidates = await self.find_matches(household.requirement, household_id)
        valid = [c for c in candidates if c["helper"].id != at_risk_helper_id]
        if not valid:
            return None

        top_backup = valid[0]
        backup_record = StagedBackup(
            id=str(uuid.uuid4())[:8],
            household_id=household_id,
            at_risk_helper_id=at_risk_helper_id,
            backup_helper_id=top_backup["helper"].id,
            score=top_backup["score"],
            status="staged",
        )
        created = await self.reflection_repo.create_staged_backup(backup_record)
        logger.info(f"[Matching Agent] Staged {top_backup['helper'].name} as backup for household {household.name}")
        return created
