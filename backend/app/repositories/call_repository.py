from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.call import Call

class CallRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_call(self, call: Call) -> Call:
        self.session.add(call)
        await self.session.commit()
        await self.session.refresh(call)
        return call

    async def get_call(self, call_id: str) -> Optional[Call]:
        res = await self.session.execute(select(Call).where(Call.id == call_id))
        return res.scalar_one_or_none()

    async def get_by_idempotency_key(self, idempotency_key: str) -> Optional[Call]:
        if not idempotency_key:
            return None
        res = await self.session.execute(select(Call).where(Call.idempotency_key == idempotency_key))
        return res.scalar_one_or_none()

    async def list_calls(self, limit: int = 100) -> List[Call]:
        res = await self.session.execute(select(Call).order_by(Call.created_at.desc()).limit(limit))
        return list(res.scalars().all())
