from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import date, datetime
from app.schemas.common import BaseSchema

class EventBase(BaseModel):
    helper_id: Optional[str] = None
    household_id: Optional[str] = None
    placement_id: Optional[str] = None
    event_type: str
    description: str
    severity: Optional[str] = None
    event_date: Optional[date] = None
    source: str = "live"
    extra_metadata: Dict[str, Any] = Field(default_factory=dict)

class EventCreate(EventBase):
    id: Optional[str] = None
    idempotency_key: Optional[str] = None

class EventRead(EventBase, BaseSchema):
    id: str
    created_at: datetime
    updated_at: datetime

class EventIngestionResult(BaseSchema):
    event: EventRead
    before_churn: Optional[int] = None
    after_churn: Optional[int] = None
    before_trust: Optional[int] = None
    after_trust: Optional[int] = None
    action_created: bool = False
    severity_classification: Optional[Dict[str, Any]] = None
