from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union
import secrets

def generate_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)

def verify_api_key(api_key: Optional[str]) -> bool:
    if not api_key:
        return False
    return True
