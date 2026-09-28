from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.schemas.dashboard import DashboardOverview, AlertItem, StagedBackupRead
from app.models.entities import Helper, Household, Placement
from app.models.reflection import Recommendation, StagedBackup
from app.models.score import Score
from app.repositories.entity_repository import EntityRepository
from app.repositories.reflection_repository import ReflectionRepository

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", response_model=DashboardOverview)
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    entity_repo = EntityRepository(db)
    refl_repo = ReflectionRepository(db)

    helpers = await entity_repo.list_helpers()
    households = await entity_repo.list_households()
    placements = await entity_repo.list_placements()
    active_placements = [p for p in placements if p.status == "active"]

    res_scores = await db.execute(select(Score))
    scores = list(res_scores.scalars().all())
    score_map = {s.entity_id: s for s in scores}

    high_churn = [s for s in scores if s.entity_type == "helper" and (s.churn or 0) >= 55]
    high_diff = [s for s in scores if s.entity_type == "household" and (s.difficulty or 0) >= 55]

    # Recommendations / Actions
    recs = await refl_repo.list_recommendations(status="pending")
    alerts = []
    for r in recs[:5]:
        alerts.append(
            AlertItem(
                flag="bad" if r.call_type == "escalation" else "warn",
                title=r.text,
                sub=f"Recommended action: {r.action}",
                action_label="Escalate" if r.call_type == "escalation" else "Review",
                entity_type=r.entity_type,
                entity_id=r.entity_id,
            )
        )

    for hh in households:
        sc = score_map.get(hh.id)
        if sc and (sc.difficulty or 0) >= 55:
            alerts.append(
                AlertItem(
                    flag="bad",
                    title=f"{hh.name} has an elevated difficulty score ({sc.difficulty}/100).",
                    sub="Multiple placement replacements on record.",
                    action_label="View reflection",
                    entity_type="household",
                    entity_id=hh.id,
                )
            )

    # Staged backups
    backups = await refl_repo.list_staged_backups()
    backup_reads = []
    for b in backups:
        hh = await entity_repo.get_household(b.household_id)
        backup_h = await entity_repo.get_helper(b.backup_helper_id)
        at_risk_h = await entity_repo.get_helper(b.at_risk_helper_id)
        backup_reads.append(
            StagedBackupRead(
                id=b.id,
                household_id=b.household_id,
                at_risk_helper_id=b.at_risk_helper_id,
                backup_helper_id=b.backup_helper_id,
                score=b.score,
                status=b.status,
                created_at=b.created_at,
                household_name=hh.name if hh else b.household_id,
                backup_helper_name=backup_h.name if backup_h else b.backup_helper_id,
                at_risk_helper_name=at_risk_h.name if at_risk_h else b.at_risk_helper_id,
            )
        )

    return DashboardOverview(
        active_helpers=len(helpers),
        active_households=len(households),
        active_placements=len(active_placements),
        actions_required=len(recs),
        high_churn_count=len(high_churn),
        high_difficulty_count=len(high_diff),
        alerts=alerts,
        staged_backups=backup_reads,
    )
