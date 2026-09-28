from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.core.db import get_db
from app.schemas.event import EventCreate, EventRead, EventIngestionResult
from app.services.event_service import EventService
from app.repositories.event_repository import EventRepository

router = APIRouter(prefix="/events", tags=["Events"])

@router.post("", response_model=EventIngestionResult)
async def create_event(payload: EventCreate, db: AsyncSession = Depends(get_db)):
    svc = EventService(db)
    result = await svc.ingest_event(
        event_type=payload.event_type,
        description=payload.description,
        helper_id=payload.helper_id,
        household_id=payload.household_id,
        placement_id=payload.placement_id,
        event_date=payload.event_date,
        source=payload.source,
        idempotency_key=payload.idempotency_key,
        extra_metadata=payload.extra_metadata,
    )
    return result

@router.get("", response_model=List[EventRead])
async def list_events(limit: int = Query(50, ge=1, le=200), db: AsyncSession = Depends(get_db)):
    repo = EventRepository(db)
    events = await repo.list_events(limit=limit)
    return events
