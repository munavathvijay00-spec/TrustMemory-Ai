from typing import Optional, Dict, Any
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin
from app.models.types import GUID, JSONType

class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    agent: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(GUID, nullable=True, index=True)
    details: Mapped[Dict[str, Any]] = mapped_column(JSONType, default=dict, nullable=False)
