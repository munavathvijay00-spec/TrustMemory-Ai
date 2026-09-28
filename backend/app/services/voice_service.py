from typing import Dict, Any, Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.call import Call
from app.models.event import Event
from app.repositories.call_repository import CallRepository
from app.repositories.entity_repository import EntityRepository
from app.agents.voice_agent import voice_agent
from app.memory.retain import retain_memory
from app.services.score_recalc import ScoreRecalcService
from app.utils.idempotency import idempotency_manager
from app.core.logging import logger
from datetime import date

class VoiceService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.call_repo = CallRepository(session)
        self.entity_repo = EntityRepository(session)
        self.recalc_service = ScoreRecalcService(session)

    async def execute_call(
        self,
        call_type: str,
        helper_id: Optional[str] = None,
        household_id: Optional[str] = None,
        reason: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Call:
        # Check idempotency
        if idempotency_key:
            existing = await self.call_repo.get_by_idempotency_key(idempotency_key)
            if existing:
                logger.info(f"[Voice Service] Call skipped — idempotency key '{idempotency_key}' already processed.")
                return existing
            idempotency_manager.check_and_set(idempotency_key)

        helper = await self.entity_repo.get_helper(helper_id) if helper_id else None
        household = await self.entity_repo.get_household(household_id) if household_id else None

        # Execute call via Voice Agent
        result = await voice_agent.plan_and_execute_call(
            call_type=call_type,
            helper_id=helper_id,
            helper_name=helper.name if helper else None,
            household_id=household_id,
            household_name=household.name if household else None,
            reason=reason,
        )

        call_record = Call(
            id=str(uuid.uuid4())[:8],
            idempotency_key=idempotency_key,
            call_type=call_type,
            helper_id=helper_id,
            household_id=household_id,
            reason=reason,
            status=result["status"],
            transcript=result["transcript"],
            summary=result["summary"],
            sentiment=result["sentiment"],
            follow_up=result["follow_up"],
        )
        saved = await self.call_repo.create_call(call_record)

        # Retain into Memory Core
        if helper_id:
            await retain_memory(
                entity_id=helper_id,
                layer="experience",
                text=f"{call_type.capitalize()} call completed. {saved.summary}",
                metadata={"call_id": saved.id},
            )
            if call_type == "coaching":
                await retain_memory(
                    entity_id=helper_id,
                    layer="opinion",
                    text="Helper demonstrated cooperative response to coaching; commitment logged.",
                    metadata={"call_id": saved.id},
                )
                # Log coaching_completed event and recalculate scores
                coaching_event = Event(
                    id=str(uuid.uuid4())[:8],
                    helper_id=helper_id,
                    household_id=household_id,
                    placement_id=None,
                    event_type="coaching_completed",
                    description="Coaching call completed; commitments logged.",
                    severity="LOW",
                    event_date=date.today(),
                    source="voice",
                )
                self.session.add(coaching_event)
                await self.session.commit()
                await self.recalc_service.recalc_helper(helper_id, reason="post_coaching")

        if household_id:
            await retain_memory(
                entity_id=household_id,
                layer="experience",
                text=f"{call_type.capitalize()} call completed regarding placement.",
                metadata={"call_id": saved.id},
            )

        return saved
