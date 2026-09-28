from typing import List, Optional
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.score import Score, ScoreHistory

class ScoreRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_score(self, entity_id: str) -> Optional[Score]:
        res = await self.session.execute(select(Score).where(Score.entity_id == entity_id))
        return res.scalar_one_or_none()

    async def list_scores(self) -> List[Score]:
        res = await self.session.execute(select(Score))
        return list(res.scalars().all())

    async def upsert_score(self, entity_id: str, entity_type: str, trust: Optional[int] = None, churn: Optional[int] = None, difficulty: Optional[int] = None) -> Score:
        score = await self.get_score(entity_id)
        if not score:
            score = Score(
                id=str(uuid.uuid4())[:8],
                entity_id=entity_id,
                entity_type=entity_type,
                trust=trust,
                churn=churn,
                difficulty=difficulty,
            )
            self.session.add(score)
        else:
            if trust is not None:
                score.trust = trust
            if churn is not None:
                score.churn = churn
            if difficulty is not None:
                score.difficulty = difficulty

        await self.session.commit()
        await self.session.refresh(score)
        return score

    async def record_history(self, entity_id: str, entity_type: str, trust: Optional[int] = None, churn: Optional[int] = None, difficulty: Optional[int] = None, reason: Optional[str] = None) -> ScoreHistory:
        hist = ScoreHistory(
            id=str(uuid.uuid4())[:8],
            entity_id=entity_id,
            entity_type=entity_type,
            trust=trust,
            churn=churn,
            difficulty=difficulty,
            reason=reason,
        )
        self.session.add(hist)
        await self.session.commit()
        await self.session.refresh(hist)
        return hist

    async def get_history(self, entity_id: str, limit: int = 20) -> List[ScoreHistory]:
        res = await self.session.execute(
            select(ScoreHistory).where(ScoreHistory.entity_id == entity_id).order_by(ScoreHistory.created_at.asc()).limit(limit)
        )
        return list(res.scalars().all())
