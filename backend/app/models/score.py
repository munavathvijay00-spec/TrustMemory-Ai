from typing import Optional
from sqlalchemy import String, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin
from app.models.types import GUID

class Score(Base, TimestampMixin):
    __tablename__ = "scores"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    entity_id: Mapped[str] = mapped_column(GUID, unique=True, nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)  # helper, household
    trust: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    churn: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

class ScoreHistory(Base, TimestampMixin):
    __tablename__ = "score_history"

    id: Mapped[str] = mapped_column(GUID, primary_key=True)
    entity_id: Mapped[str] = mapped_column(GUID, nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    trust: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    churn: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
