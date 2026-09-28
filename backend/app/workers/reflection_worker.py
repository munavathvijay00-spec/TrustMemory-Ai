import asyncio
from app.core.db import async_session_maker
from app.repositories.entity_repository import EntityRepository
from app.services.reflection_service import ReflectionService
from app.core.logging import logger

async def run_reflection_batch():
    """Runs periodic reflection across all active households."""
    async with async_session_maker() as session:
        entity_repo = EntityRepository(session)
        refl_service = ReflectionService(session)

        households = await entity_repo.list_households()
        logger.info(f"[Reflection Worker] Running periodic pattern scan across {len(households)} households.")
        for hh in households:
            try:
                await refl_service.reflect_household(hh.id)
            except Exception as e:
                logger.error(f"[Reflection Worker] Error reflecting on household {hh.id}: {e}")

async def start_reflection_worker(interval_seconds: int = 3600):
    """Background loop executing periodic reflections."""
    while True:
        try:
            await run_reflection_batch()
        except Exception as e:
            logger.error(f"[Reflection Worker Loop] Unexpected error: {e}")
        await asyncio.sleep(interval_seconds)
