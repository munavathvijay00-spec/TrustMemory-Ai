from datetime import date, datetime
from typing import List, Dict, Any, Optional
from app.utils.formatting import clamp

def calculate_trust(events: List[Any]) -> int:
    """Calculates Trust score (0-100) based on helper events."""
    score = 68.0
    for e in events:
        etype = getattr(e, "event_type", None) or (e.get("event_type") if isinstance(e, dict) else getattr(e, "type", None))
        desc = getattr(e, "description", "") or (e.get("description", "") if isinstance(e, dict) else "")
        desc_lower = desc.lower()

        if etype == "positive_feedback":
            score += 4
        elif etype == "placement_start":
            score += 1
        elif etype == "late_arrival":
            score -= 3
        elif etype == "complaint":
            score -= 6
        elif etype == "negative_feedback":
            score -= 5
        elif etype == "placement_end" and "replacement" not in desc_lower:
            score += 2

    return int(clamp(round(score), 0, 100))

def calculate_churn(events: List[Any], ref_date: Optional[date] = None) -> int:
    """Calculates Churn risk score (0-100) based on helper events with recency weighting."""
    if not events:
        return 18

    # Sort events by date
    def get_date(item):
        d = getattr(item, "event_date", None) or (item.get("event_date") if isinstance(item, dict) else getattr(item, "date", None))
        if isinstance(d, str):
            try:
                return datetime.fromisoformat(d).date()
            except Exception:
                return date.today()
        elif isinstance(d, datetime):
            return d.date()
        elif isinstance(d, date):
            return d
        return date.today()

    sorted_events = sorted(events, key=get_date)
    last_date = ref_date or get_date(sorted_events[-1])

    score = 18.0
    recent_window_days = 30

    for e in sorted_events:
        edate = get_date(e)
        days = (last_date - edate).days
        if days <= recent_window_days:
            recency_weight = 1.6
        elif days <= 90:
            recency_weight = 1.0
        else:
            recency_weight = 0.4

        etype = getattr(e, "event_type", None) or (e.get("event_type") if isinstance(e, dict) else getattr(e, "type", None))
        desc = getattr(e, "description", "") or (e.get("description", "") if isinstance(e, dict) else "")
        desc_lower = desc.lower()

        if etype == "late_arrival":
            score += 9 * recency_weight
        elif etype == "complaint":
            score += 13 * recency_weight
        elif etype == "negative_feedback":
            score += 10 * recency_weight
        elif etype == "placement_end" and "replacement" in desc_lower:
            score += 12 * recency_weight
        elif etype == "positive_feedback":
            score -= 5
        elif etype == "coaching_completed":
            score -= 14

    return int(clamp(round(score), 0, 100))

def calculate_difficulty(events: List[Any]) -> int:
    """Calculates Household Difficulty score (0-100)."""
    failed = 0
    complaints = 0

    for e in events:
        etype = getattr(e, "event_type", None) or (e.get("event_type") if isinstance(e, dict) else getattr(e, "type", None))
        desc = getattr(e, "description", "") or (e.get("description", "") if isinstance(e, dict) else "")
        desc_lower = desc.lower()

        if etype == "placement_end" and "replacement" in desc_lower:
            failed += 1
        elif etype in ("complaint", "household_complaint"):
            complaints += 1

    score = 20 + failed * 20 + complaints * 8
    return int(clamp(round(score), 0, 100))

def churn_why(events: List[Any], churn_score: int) -> List[str]:
    """Generates human-readable explanations for churn score."""
    def _etype(e):
        if isinstance(e, dict):
            return e.get("event_type") or e.get("type")
        return getattr(e, "event_type", None) or getattr(e, "type", None)

    late_count = sum(1 for e in events if _etype(e) == "late_arrival")
    complaint_count = sum(1 for e in events if _etype(e) == "complaint")
    coaching_count = sum(1 for e in events if _etype(e) == "coaching_completed")
    unresolved = complaint_count - coaching_count

    reasons = []
    if late_count:
        reasons.append(f"{late_count} late arrival{'s' if late_count > 1 else ''} on record.")
    if complaint_count:
        reasons.append(f"{complaint_count} complaint{'s' if complaint_count > 1 else ''} on record.")
    if unresolved > 0:
        reasons.append(f"{unresolved} concern{'s' if unresolved > 1 else ''} without a logged follow-up.")

    if not reasons:
        reasons.append("No adverse signals in the recent window; risk reflects baseline variance.")
    return reasons
