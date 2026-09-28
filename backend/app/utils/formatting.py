from typing import Any, Union

def clamp(v: Union[int, float], min_v: Union[int, float], max_v: Union[int, float]) -> Union[int, float]:
    return max(min_v, min(max_v, v))

def role_label(role: str) -> str:
    mapping = {
        "elder_care": "elder care",
        "child_care": "child care",
        "cleaning": "cleaning",
        "cooking": "cooking",
    }
    return mapping.get(role, role)

def trust_band(score: int) -> str:
    if score >= 80:
        return "Strong"
    elif score >= 60:
        return "Stable"
    elif score >= 40:
        return "Needs Attention"
    return "Critical"
