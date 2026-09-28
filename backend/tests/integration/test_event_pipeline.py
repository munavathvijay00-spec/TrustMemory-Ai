import pytest
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.event_service import EventService
from app.repositories.score_repository import ScoreRepository
from app.memory.recall import recall_memory

@pytest.mark.asyncio
async def test_event_ingestion_pipeline(db_session: AsyncSession, seed_data):
    svc = EventService(db_session)
    score_repo = ScoreRepository(db_session)

    # Ingest late arrival event for anita
    res = await svc.ingest_event(
        event_type="late_arrival",
        description="Helper arrived 25m late due to bus delay.",
        helper_id="anita",
        household_id="h107",
        event_date=date.today(),
        source="live",
    )

    assert res["event"].id is not None
    assert res["severity_classification"]["severity"] == "MEDIUM"

    # Verify score updated in database
    sc = await score_repo.get_score("anita")
    assert sc is not None
    assert sc.trust is not None
    assert sc.churn is not None

    # Verify memory retained
    mem = await recall_memory("anita")
    assert len(mem["experience"]) > 0
    assert any("25m late" in e["text"] for e in mem["experience"])
