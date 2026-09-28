from typing import Set, Optional
from app.core.errors import IdempotencyConflictError

class IdempotencyManager:
    def __init__(self):
        self._processed_keys: Set[str] = set()

    def check_and_set(self, key: Optional[str]) -> bool:
        """Returns True if the key is new and records it. Raises IdempotencyConflictError if duplicate."""
        if not key:
            return True
        if key in self._processed_keys:
            raise IdempotencyConflictError(key)
        self._processed_keys.add(key)
        return True

    def is_processed(self, key: Optional[str]) -> bool:
        if not key:
            return False
        return key in self._processed_keys

    def clear(self):
        self._processed_keys.clear()

idempotency_manager = IdempotencyManager()
