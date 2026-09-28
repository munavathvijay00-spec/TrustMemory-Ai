try:
    import pytest
except ImportError:
    pytest = None
from datetime import date, timedelta
from app.services.scoring_service import (
    calculate_trust,
    calculate_churn,
    calculate_difficulty,
    churn_why,
)

def test_calculate_trust_baseline_and_clamping():
    # Empty events -> baseline 68
    assert calculate_trust([]) == 68

    # Positive feedback adds 4 each
    events = [
        {"event_type": "positive_feedback", "description": "Good job"},
        {"event_type": "positive_feedback", "description": "Excellent care"},
    ]
    assert calculate_trust(events) == 68 + 8

    # Complaints (-6) and late arrivals (-3)
    adverse = [
        {"event_type": "complaint", "description": "Missed medicine"},
        {"event_type": "late_arrival", "description": "Late 30m"},
    ]
    assert calculate_trust(adverse) == 68 - 9

    # Max clamp at 100
    many_positives = [{"event_type": "positive_feedback", "description": "Great"} for _ in range(15)]
    assert calculate_trust(many_positives) == 100

    # Min clamp at 0
    many_negatives = [{"event_type": "complaint", "description": "Severe failure"} for _ in range(20)]
    assert calculate_trust(many_negatives) == 0

def test_calculate_churn_recency_and_coaching():
    # Empty events -> baseline 18
    assert calculate_churn([]) == 18

    today = date(2026, 3, 8)

    # Event within 30 days has weight 1.6: 18 + 9 * 1.6 = 18 + 14.4 = 32.4 -> 32
    recent_late = [
        {"event_type": "late_arrival", "description": "Late", "event_date": today - timedelta(days=5)}
    ]
    assert calculate_churn(recent_late, ref_date=today) == 32

    # Coaching completed reduces churn by 14
    with_coaching = [
        {"event_type": "late_arrival", "description": "Late", "event_date": today - timedelta(days=5)},
        {"event_type": "coaching_completed", "description": "Commitment made", "event_date": today - timedelta(days=2)},
    ]
    # 18 + 14.4 - 14 = 18.4 -> 18
    assert calculate_churn(with_coaching, ref_date=today) == 18

def test_calculate_difficulty():
    # Empty events -> baseline 20
    assert calculate_difficulty([]) == 20

    events = [
        {"event_type": "complaint", "description": "Late"},
        {"event_type": "placement_end", "description": "Placement ended — household requested replacement"},
        {"event_type": "placement_end", "description": "Contract ended — household requested replacement"},
    ]
    # 20 + 2*20 + 1*8 = 68
    assert calculate_difficulty(events) == 68

def test_churn_why():
    events = [
        {"event_type": "late_arrival", "description": "Late"},
        {"event_type": "complaint", "description": "Dispute"},
    ]
    reasons = churn_why(events, 45)
    assert any("late arrival" in r for r in reasons)
    assert any("complaint" in r for r in reasons)
