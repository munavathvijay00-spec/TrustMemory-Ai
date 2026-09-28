from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.common import BaseSchema

class ScoreRead(BaseSchema):
    id: str
    entity_id: str
    entity_type: str
    trust: Optional[int] = None
    churn: Optional[int] = None
    difficulty: Optional[int] = None
    created_at: datetime
    updated_at: datetime

class ScoreHistoryRead(BaseSchema):
    id: str
    entity_id: str
    entity_type: str
    trust: Optional[int] = None
    churn: Optional[int] = None
    difficulty: Optional[int] = None
    reason: Optional[str] = None
    created_at: datetime

class ScoreRecalcResult(BaseSchema):
    entity_id: str
    entity_type: str
    trust: Optional[int] = None
    churn: Optional[int] = None
    difficulty: Optional[int] = None
    why: List[str] = []
