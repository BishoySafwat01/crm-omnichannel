import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from fastapi.staticfiles import StaticFiles

from app.api.v1.admin.analytics import router as admin_analytics_router
from app.api.v1.admin.automations import router as admin_automations_router
from app.api.v1.admin.customers import router as admin_customers_router
from app.api.v1.admin.team import router as admin_team_router
from app.api.v1.auth import router as auth_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.customers import router as customers_router
from app.api.v1.media import router as media_router
from app.api.v1.meta import router as meta_router
from app.api.v1.respond_io import router as respond_io_router
from app.api.v1.ws import router as ws_router
from app.api.webhooks import router as webhooks_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.redis import close_redis_client, get_redis_client
import asyncio
from app.services.meta_import_service import meta_import_service


logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure upload directory exists (side-effect moved from config.py)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    async def meta_sync_loop():
        await asyncio.sleep(5)
        while True:
            try:
                await meta_import_service.sync_live_conversations()
            except Exception:
                logger.exception("[MetaSync] Unhandled exception in Meta sync loop")
            await asyncio.sleep(5)

    async def sla_eval_loop():
        from app.services.sla_service import SlaService
        await asyncio.sleep(10)
        while True:
            try:
                async with AsyncSessionLocal() as session:
                    await SlaService.evaluate_overdue_conversations(session)
            except Exception:
                logger.exception("[SLAEngine] Unhandled exception in SLA evaluation loop")
            await asyncio.sleep(30)

    meta_task = asyncio.create_task(meta_sync_loop())
    sla_task = asyncio.create_task(sla_eval_loop())

    yield

    # Shutdown
    meta_task.cancel()
    sla_task.cancel()
    await close_redis_client()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware — use explicitly configured origins only (OWASP A05 fix)
_cors_origins = settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["http://localhost:3000", "http://127.0.0.1:3000"]
_allow_credentials = "*" not in _cors_origins  # credentials require scoped origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static uploads directory with Range headers support
uploads_dir = settings.UPLOAD_DIR
os.makedirs(uploads_dir, exist_ok=True)
try:
    app.mount("/uploads", StaticFiles(directory=uploads_dir, html=False), name="uploads")
except Exception:
    pass  # Graceful degradation: upload serving skipped if directory unavailable

# Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(customers_router, prefix="/api/v1")
app.include_router(admin_automations_router, prefix="/api/v1/admin/automations")
app.include_router(admin_analytics_router, prefix="/api/v1/admin/analytics")
app.include_router(admin_customers_router, prefix="/api/v1/admin/customers")
app.include_router(admin_team_router)




app.include_router(conversations_router, prefix="/api/v1")
app.include_router(media_router, prefix="/api/v1")
app.include_router(meta_router, prefix="/api/v1")
app.include_router(respond_io_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")
app.include_router(ws_router)
app.include_router(webhooks_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "app": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "status": "running",
    }


async def perform_health_check() -> tuple[dict[str, Any], int]:
    postgres_status = "unhealthy"
    redis_status = "unhealthy"

    # Check PostgreSQL
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            if result.scalar() == 1:
                postgres_status = "healthy"
    except Exception as e:
        postgres_status = f"unhealthy: {str(e)}"

    # Check Redis
    try:
        client = await get_redis_client()
        pong = await client.ping()
        if pong:
            redis_status = "healthy"
    except Exception as e:
        redis_status = f"unhealthy: {str(e)}"

    is_healthy = postgres_status == "healthy" and redis_status == "healthy"
    status_code = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    body = {
        "status": "ok" if is_healthy else "degraded",
        "postgres": postgres_status,
        "redis": redis_status,
    }
    return body, status_code


@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    body, status_code = await perform_health_check()
    return JSONResponse(content=body, status_code=status_code)
