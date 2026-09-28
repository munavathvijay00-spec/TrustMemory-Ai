from typing import List, Optional, Dict, Any
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog

class AuditRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def log_activity(self, agent: str, action: str, entity_id: Optional[str] = None, details: Optional[Dict[str, Any]] = None) -> AuditLog:
        entry = AuditLog(
            id=str(uuid.uuid4())[:8],
            agent=agent,
            action=action,
            entity_id=entity_id,
            details=details or {},
        )
        self.session.add(entry)
        await self.session.commit()
        await self.session.refresh(entry)
        return entry

    async def list_logs(self, limit: int = 150) -> List[AuditLog]:
        res = await self.session.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
        return list(res.scalars().all())
