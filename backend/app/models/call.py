from typing import Optional, List, Dict, Any
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin
from app.models.types import GUID, JSONType

class Call(Base, TimestampMixin):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True, index=True)
    call_type: Mapped[str] = mapped_column(String(32), nullable=False)  # coaching, checkin, escalation
    helper_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("helpers.id"), nullable=True, index=True)
    household_id: Mapped[Optional[str]] = mapped_column(GUID, ForeignKey("households.id"), nullable=True, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    transcript: Mapped[List[Dict[str, str]]] = mapped_column(JSONType, default=list, nullable=False)
    summary: Mapped[str] = mapped_column(String(512), nullable=False)
    sentiment: Mapped[str] = mapped_column(String(32), default="neutral", nullable=False)
    follow_up: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
