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
from app.api.v1.comments import router as comments_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.customers import router as customers_router
from app.api.v1.media import router as media_router
from app.api.v1.meta import router as meta_router
from app.api.v1.moderation import router as moderation_router
from app.api.v1.beon import router as beon_router
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

    # Security: warn loudly at startup if webhook signature secret is missing,
    # because /api/v1/meta/webhook runs fail-closed and will reject all payloads.
    if not (settings.META_APP_SECRET and settings.META_APP_SECRET.strip()):
        logger.warning(
            "[SECURITY] META_APP_SECRET is not configured — the Meta webhook endpoint "
            "(/api/v1/meta/webhook) will REJECT all inbound payloads until it is set."
        )

    # Meta Page Webhook Auto-Subscription (Non-blocking background task)
    async def auto_subscribe_meta_page():
        try:
            from app.integrations.meta import MetaClient
            meta_client = MetaClient()
            if not meta_client.access_token or not meta_client.access_token.strip():
                logger.info("[MetaWebhook] Auto-subscription skipped: META_PAGE_ACCESS_TOKEN is not configured.")
                return
            if not meta_client.page_id or not meta_client.page_id.strip():
                logger.info("[MetaWebhook] Auto-subscription skipped: META_PAGE_ID is not configured.")
                return

            logger.info("[MetaWebhook] Initiating automated Meta Page Webhook subscription for Page ID: %s...", meta_client.page_id)
            result = await meta_client.subscribe_page_to_app()
            if result.get("success"):
                logger.info("[MetaWebhook] Successfully auto-subscribed Facebook Page %s to CRM App Webhooks.", meta_client.page_id)
            else:
                logger.warning("[MetaWebhook] Auto-subscription failed gracefully: %s (Details: %s)", result.get("error"), result.get("details"))
        except Exception as exc:
            logger.warning("[MetaWebhook] Non-blocking auto-subscription encountered an error: %s", exc)

    async def meta_sync_loop():
        from app.integrations.meta.rate_limit import MetaRateLimitGuard
        if not getattr(settings, "META_ENABLE_LIVE_POLLING", False):
            logger.info(
                "[MetaSync] Real-time Webhooks are active. Background conversation polling loop is disabled "
                "(META_ENABLE_LIVE_POLLING=false). Enable only if webhooks are unavailable."
            )
            return

        poll_interval = max(60, getattr(settings, "META_POLL_INTERVAL_SECONDS", 300))
        logger.info(
            "[MetaSync] Starting background conversation polling loop (Interval: %ds, Cooldown Guard: active)...",
            poll_interval,
        )
        await asyncio.sleep(15)
        while True:
            try:
                if MetaRateLimitGuard.is_rate_limited():
                    rem = MetaRateLimitGuard.get_cooldown_remaining()
                    logger.warning(
                        "[MetaSync] Meta Graph API rate limit cooldown active (%ds remaining). Skipping polling cycle.",
                        int(rem),
                    )
                else:
                    await meta_import_service.sync_live_conversations()
            except Exception:
                logger.exception("[MetaSync] Unhandled exception in Meta sync loop")
            await asyncio.sleep(poll_interval)

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

    auto_sub_task = asyncio.create_task(auto_subscribe_meta_page())
    meta_task = asyncio.create_task(meta_sync_loop())
    sla_task = asyncio.create_task(sla_eval_loop())

    yield

    # Shutdown
    auto_sub_task.cancel()
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

# CORS middleware — support localhost, Vercel deployments, and production domains
_cors_origins = list(settings.CORS_ORIGINS) if settings.CORS_ORIGINS else []
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins if _cors_origins else ["*"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
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
app.include_router(admin_team_router, prefix="/api/v1/admin/team")
app.include_router(comments_router, prefix="/api/v1/comments")
app.include_router(conversations_router, prefix="/api/v1")
app.include_router(media_router, prefix="/api/v1")
app.include_router(meta_router, prefix="/api/v1")
app.include_router(moderation_router, prefix="/api/v1")
app.include_router(beon_router, prefix="/api/v1")
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
