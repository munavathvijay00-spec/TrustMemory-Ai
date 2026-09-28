from typing import Optional, List
from sqlalchemy import String, Float, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin
from app.models.types import GUID, ArrayType

class Reflection(Base, TimestampMixin):
    __tablename__ = "reflections"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)  # helper, household
    entity_id: Mapped[str] = mapped_column(GUID, nullable=False, index=True)
    classification: Mapped[str] = mapped_column(String(32), nullable=False)  # FACT, OBSERVATION, HYPOTHESIS
    insight: Mapped[str] = mapped_column(String(512), nullable=False)
    evidence: Mapped[List[str]] = mapped_column(ArrayType, default=list, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.8, nullable=False)

class Recommendation(Base, TimestampMixin):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str] = mapped_column(GUID, nullable=False, index=True)
    text: Mapped[str] = mapped_column(String(512), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    call_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # coaching, escalation
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)

class StagedBackup(Base, TimestampMixin):
    __tablename__ = "staged_backups"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    household_id: Mapped[str] = mapped_column(GUID, ForeignKey("households.id"), nullable=False, index=True)
    at_risk_helper_id: Mapped[str] = mapped_column(GUID, ForeignKey("helpers.id"), nullable=False, index=True)
    backup_helper_id: Mapped[str] = mapped_column(GUID, ForeignKey("helpers.id"), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="staged", nullable=False)  # staged, promoted, dismissed
