try:
    import pytest
except ImportError:
    class _MockPytest:
        class raises:
            def __init__(self, exc_type):
                self.exc_type = exc_type
            def __enter__(self):
                return self
            def __exit__(self, exc_type, exc_val, exc_tb):
                if exc_type is None:
                    raise AssertionError(f"Expected {self.exc_type} but no exception was raised.")
                return issubclass(exc_type, self.exc_type)
    pytest = _MockPytest()
from app.utils.idempotency import IdempotencyManager
from app.core.errors import IdempotencyConflictError

def test_idempotency_manager():
    mgr = IdempotencyManager()
    mgr.clear()

    # None or empty key is always allowed
    assert mgr.check_and_set(None) is True
    assert mgr.check_and_set("") is True

    # First time setting key succeeds
    assert mgr.check_and_set("key_123") is True
    assert mgr.is_processed("key_123") is True

    # Duplicate call raises IdempotencyConflictError
    with pytest.raises(IdempotencyConflictError):
        mgr.check_and_set("key_123")

    mgr.clear()
    assert mgr.is_processed("key_123") is False
