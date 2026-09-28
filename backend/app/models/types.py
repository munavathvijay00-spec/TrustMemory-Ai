import json
from typing import Any, List
from sqlalchemy import TypeDecorator, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB as PG_JSONB, ARRAY as PG_ARRAY

class GUID(TypeDecorator):
    """Platform-independent GUID/ID type.
    Uses String(64) to support both UUIDs and human-readable IDs (e.g. 'anita', 'h101').
    """
    impl = String(64)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        return value

class JSONType(TypeDecorator):
    """Cross-dialect JSON type."""
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_JSONB())
        return dialect.type_descriptor(JSON())

class ArrayType(TypeDecorator):
    """Cross-dialect array / list type stored as JSON on SQLite or native ARRAY on Postgres."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, (list, tuple)):
            return json.dumps(list(value))
        return json.dumps([value])

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return []
        try:
            return json.loads(value)
        except Exception:
            return []
