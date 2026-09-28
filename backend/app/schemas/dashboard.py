from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from app.schemas.common import BaseSchema

class AlertItem(BaseSchema):
    flag: str  # ok, warn, bad, info
    title: str
    sub: str
    action_label: str
    entity_type: str
    entity_id: str

class StagedBackupRead(BaseSchema):
    id: str
    household_id: str
    at_risk_helper_id: str
    backup_helper_id: str
    score: int
    status: str
    created_at: datetime
    household_name: Optional[str] = None
    backup_helper_name: Optional[str] = None
    at_risk_helper_name: Optional[str] = None

class ReflectionRead(BaseSchema):
    id: str
    entity_type: str
    entity_id: str
    classification: str
    insight: str
    evidence: List[str] = Field(default_factory=list)
    confidence: float
    created_at: datetime

class DashboardOverview(BaseSchema):
    active_helpers: int
    active_households: int
    active_placements: int
    actions_required: int
    high_churn_count: int
    high_difficulty_count: int
    alerts: List[AlertItem] = Field(default_factory=list)
    staged_backups: List[StagedBackupRead] = Field(default_factory=list)
