import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.voice_service import VoiceService
from app.repositories.call_repository import CallRepository
from app.repositories.score_repository import ScoreRepository
from app.memory.recall import recall_memory

@pytest.mark.asyncio
async def test_voice_service_call_and_idempotency(db_session: AsyncSession, seed_data):
    svc = VoiceService(db_session)
    call_repo = CallRepository(db_session)

    idemp_key = "test_voice_key_001"

    # Place coaching call
    call1 = await svc.execute_call(
        call_type="coaching",
        helper_id="anita",
        household_id="h107",
        reason="Attendance review",
        idempotency_key=idemp_key,
    )
    assert call1.id is not None
    assert call1.status == "completed"
    assert "acknowledged attendance concerns" in call1.summary

    # Duplicate call with same idempotency key returns existing record
    call2 = await svc.execute_call(
        call_type="coaching",
        helper_id="anita",
        household_id="h107",
        reason="Attendance review",
        idempotency_key=idemp_key,
    )
    assert call2.id == call1.id

    # Verify calls table has only 1 record for this key
    calls = await call_repo.list_calls()
    assert len([c for c in calls if c.idempotency_key == idemp_key]) == 1

    # Verify memory retained call outcome
    mem = await recall_memory("anita")
    assert any("Coaching call completed" in e["text"] for e in mem["experience"])
