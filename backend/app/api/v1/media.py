import logging
import os
import uuid
from urllib.parse import urlparse
import httpx
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from app.core.config import settings

router = APIRouter(prefix="/media", tags=["media"])
logger = logging.getLogger("MediaProxy")

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_DOMAIN_SUFFIXES = (
    "fbsbx.com",
    "fbcdn.net",
    "cdninstagram.com",
    "facebook.com",
    "instagram.com",
    "whatsapp.net",
)


def is_trusted_meta_url(target_url: str) -> bool:
    try:
        parsed = urlparse(target_url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = (parsed.hostname or "").lower()
        if not hostname:
            return False
        return any(
            hostname == suffix or hostname.endswith("." + suffix)
            for suffix in ALLOWED_DOMAIN_SUFFIXES
        )
    except Exception as e:
        logger.warning(f"[Security] Failed to parse media URL {target_url}: {e}")
        return False


@router.post("/upload", summary="Upload Media Attachment")
async def upload_media(file: UploadFile = File(...)):
    """Upload media file for attachment relay in chat."""
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is required.",
        )

    file_ext = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        media_url = f"/uploads/{unique_filename}"
        mime_type = file.content_type or "application/octet-stream"

        media_type = "file"
        if mime_type.startswith("image/"):
            media_type = "image"
        elif mime_type.startswith("audio/"):
            media_type = "audio"
        elif mime_type.startswith("video/"):
            media_type = "video"

        return {
            "status": "success",
            "media_id": str(uuid.uuid4()),
            "url": media_url,
            "filename": file.filename,
            "mime_type": mime_type,
            "media_type": media_type,
            "size": len(content),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Media upload failed: {str(exc)}",
        )


@router.get("/proxy", summary="Proxy External Meta CDN Media")
async def proxy_meta_media(url: str = Query(..., description="External media URL from Meta")):
    if not url or not url.strip():
        raise HTTPException(status_code=400, detail="Missing media URL")

    if not is_trusted_meta_url(url):
        logger.warning(f"[Security] Blocked untrusted URL: {url}")
        raise HTTPException(status_code=403, detail="Forbidden media host")

    # Standard browser headers required by Meta CDN
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    }

    # CRITICAL: Only attach Authorization header to Graph API endpoints (NEVER to pre-signed CDN fbsbx/fbcdn URLs)
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if hostname == "graph.facebook.com" and settings.META_PAGE_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.META_PAGE_ACCESS_TOKEN}"

    client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    try:
        req = client.build_request("GET", url, headers=headers)
        resp = await client.send(req, stream=True)

        if resp.is_error:
            logger.error(f"[Media Proxy Error] Meta upstream returned HTTP {resp.status_code} for URL: {url}")
            await resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=resp.status_code, detail=f"Upstream CDN returned {resp.status_code}")

        async def media_stream():
            try:
                async for chunk in resp.aiter_bytes(chunk_size=65536):
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()

        content_type = resp.headers.get("content-type", "image/jpeg")
        return StreamingResponse(
            media_stream(),
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        await client.aclose()
        logger.error(f"[Media Proxy Exception] {e}")
        raise HTTPException(status_code=502, detail="Failed to connect to media host")
