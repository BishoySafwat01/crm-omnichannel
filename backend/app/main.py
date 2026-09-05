import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

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
from app.services.meta_import_service import meta_import_service
from app.workers.beon_worker import start_beon_polling_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Security: warn loudly at startup if webhook signature secret is missing
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
    interval = getattr(settings, "BEON_SYNC_INTERVAL_SECONDS", 15)
    beon_task = asyncio.create_task(start_beon_polling_worker(interval_seconds=interval))

    from app.api.v1.ws import start_redis_listener
    redis_listener_task = asyncio.create_task(start_redis_listener())

    yield

    # Shutdown
    auto_sub_task.cancel()
    meta_task.cancel()
    sla_task.cancel()
    beon_task.cancel()
    redis_listener_task.cancel()
    await asyncio.gather(
        auto_sub_task, meta_task, sla_task, beon_task, redis_listener_task, return_exceptions=True
    )
    await close_redis_client()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
_cors_origins = list(settings.CORS_ORIGINS) if settings.CORS_ORIGINS else []
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins if _cors_origins else ["*"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static uploads directory for serving media attachments
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/health", tags=["system"], summary="System health probe")
async def health_check() -> JSONResponse:
    pg_status = "unknown"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        pg_status = "healthy"
    except Exception as exc:
        logger.error("Health check - PostgreSQL unreachable: %s", exc)
        pg_status = "unhealthy"

    redis_status = "unknown"
    try:
        r = await get_redis_client()
        await r.ping()
        redis_status = "healthy"
    except Exception as exc:
        logger.error("Health check - Redis unreachable: %s", exc)
        redis_status = "unhealthy"

    overall = "ok" if (pg_status == "healthy" and redis_status == "healthy") else "degraded"
    http_status = status.HTTP_200_OK if overall == "ok" else status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=http_status,
        content={
            "status": overall,
            "postgres": pg_status,
            "redis": redis_status,
        },
    )


# Include Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(conversations_router, prefix="/api/v1")
app.include_router(customers_router, prefix="/api/v1")
app.include_router(comments_router, prefix="/api/v1")
app.include_router(media_router, prefix="/api/v1")
app.include_router(meta_router, prefix="/api/v1")
app.include_router(beon_router, prefix="/api/v1")
app.include_router(moderation_router, prefix="/api/v1")
app.include_router(webhooks_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")

# Admin Routers
app.include_router(admin_analytics_router, prefix="/api/v1")
app.include_router(admin_automations_router, prefix="/api/v1")
app.include_router(admin_customers_router, prefix="/api/v1")
app.include_router(admin_team_router, prefix="/api/v1")
