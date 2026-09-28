from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.reflection import Reflection, Recommendation, StagedBackup

class ReflectionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_reflection(self, refl: Reflection) -> Reflection:
        self.session.add(refl)
        await self.session.commit()
        await self.session.refresh(refl)
        return refl

    async def list_reflections(self, entity_id: Optional[str] = None) -> List[Reflection]:
        query = select(Reflection)
        if entity_id:
            query = query.where(Reflection.entity_id == entity_id)
        res = await self.session.execute(query.order_by(Reflection.created_at.desc()))
        return list(res.scalars().all())

    async def create_recommendation(self, rec: Recommendation) -> Recommendation:
        self.session.add(rec)
        await self.session.commit()
        await self.session.refresh(rec)
        return rec

    async def list_recommendations(self, status: str = "pending") -> List[Recommendation]:
        res = await self.session.execute(
            select(Recommendation).where(Recommendation.status == status).order_by(Recommendation.created_at.desc())
        )
        return list(res.scalars().all())

    async def create_staged_backup(self, backup: StagedBackup) -> StagedBackup:
        self.session.add(backup)
        await self.session.commit()
        await self.session.refresh(backup)
        return backup

    async def get_staged_backup(self, household_id: str, status: str = "staged") -> Optional[StagedBackup]:
        res = await self.session.execute(
            select(StagedBackup).where(
                StagedBackup.household_id == household_id,
                StagedBackup.status == status
            )
        )
        return res.scalar_one_or_none()

    async def list_staged_backups(self, status: str = "staged") -> List[StagedBackup]:
        res = await self.session.execute(
            select(StagedBackup).where(StagedBackup.status == status).order_by(StagedBackup.created_at.desc())
        )
        return list(res.scalars().all())
