from datetime import date, datetime, timezone
from typing import Union

def calculate_recency_weight(event_date: Union[date, datetime], ref_date: Union[date, datetime], recent_window_days: int = 30) -> float:
    """Calculates decay/recency weight:
    <= 30 days: 1.6
    <= 90 days: 1.0
    > 90 days: 0.4
    """
    if isinstance(event_date, datetime):
        event_date = event_date.date()
    if isinstance(ref_date, datetime):
        ref_date = ref_date.date()

    delta_days = (ref_date - event_date).days
    if delta_days <= recent_window_days:
        return 1.6
    elif delta_days <= 90:
        return 1.0
    return 0.4
