from typing import Any, Dict, Optional

class AppError(Exception):
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

class EntityNotFoundError(AppError):
    def __init__(self, entity_name: str, entity_id: Any):
        super().__init__(f"{entity_name} with id '{entity_id}' not found.")
        self.entity_name = entity_name
        self.entity_id = entity_id

class IdempotencyConflictError(AppError):
    def __init__(self, key: str, message: str = "Request with this idempotency key is already processed."):
        super().__init__(message, {"idempotency_key": key})
        self.key = key

class ExternalServiceError(AppError):
    def __init__(self, service: str, message: str):
        super().__init__(f"{service} error: {message}", {"service": service})
