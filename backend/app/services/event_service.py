from typing import Dict, Any, Optional
import uuid
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.event import Event
from app.models.reflection import Recommendation
from app.repositories.event_repository import EventRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.entity_repository import EntityRepository
from app.repositories.reflection_repository import ReflectionRepository
from app.services.score_recalc import ScoreRecalcService
from app.services.matching_service import MatchingService
from app.llm.severity import classify_event_severity
from app.memory.retain import retain_memory
from app.memory.recall import recall_memory
from app.utils.idempotency import idempotency_manager
from app.core.logging import logger

class EventService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.event_repo = EventRepository(session)
        self.score_repo = ScoreRepository(session)
        self.entity_repo = EntityRepository(session)
        self.reflection_repo = ReflectionRepository(session)
        self.recalc_service = ScoreRecalcService(session)
        self.matching_service = MatchingService(session)

    async def ingest_event(
        self,
        event_type: str,
        description: str,
        helper_id: Optional[str] = None,
        household_id: Optional[str] = None,
        placement_id: Optional[str] = None,
        event_date: Optional[date] = None,
        source: str = "live",
        idempotency_key: Optional[str] = None,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if idempotency_key:
            idempotency_manager.check_and_set(idempotency_key)

        ev_date = event_date or date.today()

        # Previous scores
        before_churn = None
        before_trust = None
        if helper_id:
            sc = await self.score_repo.get_score(helper_id)
            if sc:
                before_churn = sc.churn
                before_trust = sc.trust

        # 1. Memory Agent retains
        if helper_id:
            await retain_memory(helper_id, "experience", description, {"type": event_type, "date": str(ev_date)})
        if household_id:
            await retain_memory(household_id, "experience", description, {"type": event_type, "date": str(ev_date)})

        # 2. Decision Agent recalls context
        if helper_id:
            await recall_memory(helper_id, query="evaluating new event")

        # 3. Classify severity
        classification = await classify_event_severity(event_type, description)
        severity = classification.get("severity", "LOW")

        # 4. Save Event in DB
        event_record = Event(
            id=str(uuid.uuid4())[:8],
            helper_id=helper_id,
            household_id=household_id,
            placement_id=placement_id,
            event_type=event_type,
            description=description,
            severity=severity,
            event_date=ev_date,
            source=source,
            extra_metadata=extra_metadata or {},
        )
        saved_event = await self.event_repo.create_event(event_record)

        # 5. Recalculate scores
        after_churn = None
        after_trust = None
        if helper_id:
            recalc = await self.recalc_service.recalc_helper(helper_id, reason=f"event:{event_type}")
            after_churn = recalc["churn"]
            after_trust = recalc["trust"]

            # Retain Opinion
            await retain_memory(
                helper_id,
                "opinion",
                f"Churn risk assessed at {after_churn}/100.",
                {"score": after_churn},
            )

        if household_id:
            await self.recalc_service.recalc_household(household_id, reason=f"event:{event_type}")

        # 6. Check Action Trigger / Recommendation
        action_created = False
        crossed_medium = (after_churn is not None and before_churn is not None and after_churn >= 55 and before_churn < 55)
        crossed_critical = (after_churn is not None and before_churn is not None and after_churn >= 75 and before_churn < 75)

        if crossed_medium or crossed_critical:
            is_critical = after_churn >= 75
            call_type = "escalation" if is_critical else "coaching"
            action_desc = "Escalate to coordinator" if is_critical else "Start coaching call"

            rec = Recommendation(
                id=str(uuid.uuid4())[:8],
                entity_type="helper",
                entity_id=helper_id,
                text=f"Helper churn risk increased from {before_churn} to {after_churn}.",
                action=action_desc,
                call_type=call_type,
                status="pending",
            )
            await self.reflection_repo.create_recommendation(rec)
            action_created = True
            logger.info(f"[Decision Agent] Recommended action for helper {helper_id}: {action_desc}")

        # 7. Proactively pre-stage backup if critical
        if helper_id and household_id and after_churn is not None and after_churn >= 75:
            await self.matching_service.ensure_backup_staged(
                household_id=household_id,
                at_risk_helper_id=helper_id,
                churn_score=after_churn,
            )

        return {
            "event": saved_event,
            "before_churn": before_churn,
            "after_churn": after_churn,
            "before_trust": before_trust,
            "after_trust": after_trust,
            "action_created": action_created,
            "severity_classification": classification,
        }
