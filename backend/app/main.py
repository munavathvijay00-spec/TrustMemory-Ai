from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.core.db import engine
from app.core.errors import AppError, IdempotencyConflictError, EntityNotFoundError
from app.models.base import Base
import app.models  # ensure models registered

from app.api.routes import (
    health,
    events,
    helpers,
    households,
    placements,
    memory,
    matching,
    reflections,
    voice,
    scores,
    dashboard,
    auth,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Initializing database schemas...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info(f"{settings.PROJECT_NAME} initialized successfully.")
    yield
    await engine.dispose()
    logger.info("Engine disposed on shutdown.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Error Handlers
@app.exception_handler(IdempotencyConflictError)
async def idempotency_exception_handler(request: Request, exc: IdempotencyConflictError):
    return JSONResponse(
        status_code=409,
        content={"detail": exc.message, "details": exc.details},
    )

@app.exception_handler(EntityNotFoundError)
async def entity_not_found_handler(request: Request, exc: EntityNotFoundError):
    return JSONResponse(
        status_code=404,
        content={"detail": exc.message, "details": exc.details},
    )

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=400,
        content={"detail": exc.message, "details": exc.details},
    )

# Include Routers
api_v1 = settings.API_V1_STR
app.include_router(health.router, prefix=api_v1)
app.include_router(events.router, prefix=api_v1)
app.include_router(helpers.router, prefix=api_v1)
app.include_router(households.router, prefix=api_v1)
app.include_router(placements.router, prefix=api_v1)
app.include_router(memory.router, prefix=api_v1)
app.include_router(matching.router, prefix=api_v1)
app.include_router(reflections.router, prefix=api_v1)
app.include_router(voice.router, prefix=api_v1)
app.include_router(scores.router, prefix=api_v1)
app.include_router(dashboard.router, prefix=api_v1)
app.include_router(auth.router, prefix=api_v1)
