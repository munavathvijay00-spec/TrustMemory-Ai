from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.event import Event

class EventRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_event(self, event: Event) -> Event:
        self.session.add(event)
        await self.session.commit()
        await self.session.refresh(event)
        return event

    async def get_event(self, event_id: str) -> Optional[Event]:
        res = await self.session.execute(select(Event).where(Event.id == event_id))
        return res.scalar_one_or_none()

    async def list_events(self, limit: int = 100) -> List[Event]:
        res = await self.session.execute(select(Event).order_by(Event.event_date.desc(), Event.created_at.desc()).limit(limit))
        return list(res.scalars().all())

    async def list_helper_events(self, helper_id: str) -> List[Event]:
        res = await self.session.execute(select(Event).where(Event.helper_id == helper_id).order_by(Event.event_date.asc()))
        return list(res.scalars().all())

    async def list_household_events(self, household_id: str) -> List[Event]:
        res = await self.session.execute(select(Event).where(Event.household_id == household_id).order_by(Event.event_date.asc()))
        return list(res.scalars().all())
