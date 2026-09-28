from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import Helper, Household, Placement

class EntityRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_helper(self, helper_id: str) -> Optional[Helper]:
        res = await self.session.execute(select(Helper).where(Helper.id == helper_id))
        return res.scalar_one_or_none()

    async def list_helpers(self) -> List[Helper]:
        res = await self.session.execute(select(Helper))
        return list(res.scalars().all())

    async def create_helper(self, helper: Helper) -> Helper:
        self.session.add(helper)
        await self.session.commit()
        await self.session.refresh(helper)
        return helper

    async def get_household(self, household_id: str) -> Optional[Household]:
        res = await self.session.execute(select(Household).where(Household.id == household_id))
        return res.scalar_one_or_none()

    async def list_households(self) -> List[Household]:
        res = await self.session.execute(select(Household))
        return list(res.scalars().all())

    async def create_household(self, household: Household) -> Household:
        self.session.add(household)
        await self.session.commit()
        await self.session.refresh(household)
        return household

    async def get_placement(self, placement_id: str) -> Optional[Placement]:
        res = await self.session.execute(select(Placement).where(Placement.id == placement_id))
        return res.scalar_one_or_none()

    async def list_placements(self) -> List[Placement]:
        res = await self.session.execute(select(Placement))
        return list(res.scalars().all())

    async def create_placement(self, placement: Placement) -> Placement:
        self.session.add(placement)
        await self.session.commit()
        await self.session.refresh(placement)
        return placement
