import logging
import os
import uuid
from typing import Optional
from urllib.parse import urlparse
import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_optional_current_user
from app.core.config import settings
from app.models.user import User
from app.services.audit_service import AuditService

router = APIRouter(prefix="/media", tags=["media"])
logger = logging.getLogger("MediaProxy")

UPLOAD_DIR = settings.UPLOAD_DIR
# P2-7: Security constants for upload validation
MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB hard limit
ALLOWED_MIME_TYPES: dict[str, str] = {
    # Images
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    # Audio
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mp4": ".m4a",
    "audio/webm": ".webm",
    "audio/aac": ".aac",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/x-m4a": ".m4a",
    # Video
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/ogg": ".ogv",
    "video/x-msvideo": ".avi",
    "video/x-matroska": ".mkv",
    # Documents & Mocks
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/octet-stream": ".bin",
}

ALLOWED_DOMAIN_SUFFIXES = (
    "fbsbx.com",
    "fbcdn.net",
    "cdninstagram.com",
    "facebook.com",
    "instagram.com",
    "whatsapp.net",
    "httpbin.org",
    "placeholder.com",
    "via.placeholder.com",
    "localhost",
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
async def upload_media(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Upload media file for attachment relay in chat. Max 25 MB; MIME type allowlisted."""
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is required.",
        )

    # MIME type validation (strip parameters like ;codecs=opus)
    raw_mime = (file.content_type or "application/octet-stream").strip()
    mime_type = raw_mime.split(";")[0].strip().lower()
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: '{mime_type}'. Allowed types: {sorted(ALLOWED_MIME_TYPES.keys())}.",
        )

    # Size validation
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_SIZE_BYTES // 1024 // 1024} MB.",
        )

    # Derive extension from MIME type to prevent spoofing
    safe_ext = ALLOWED_MIME_TYPES.get(mime_type, ".bin")
    unique_filename = f"{uuid.uuid4().hex}{safe_ext}"
    
    target_dir = UPLOAD_DIR
    try:
        os.makedirs(target_dir, exist_ok=True)
    except PermissionError:
        target_dir = "/tmp/crm_uploads"
        os.makedirs(target_dir, exist_ok=True)

    file_path = os.path.join(target_dir, unique_filename)

    try:
        try:
            with open(file_path, "wb") as f:
                f.write(content)
        except PermissionError:
            target_dir = "/tmp/crm_uploads"
            os.makedirs(target_dir, exist_ok=True)
            file_path = os.path.join(target_dir, unique_filename)
            with open(file_path, "wb") as f:
                f.write(content)

        media_url = f"/uploads/{unique_filename}"

        media_type = "file"
        if mime_type.startswith("image/"):
            media_type = "image"
        elif mime_type.startswith("audio/"):
            media_type = "audio"
        elif mime_type.startswith("video/"):
            media_type = "video"

        media_id = str(uuid.uuid4())

        # Audit media upload if authenticated user
        if current_user:
            try:
                client_ip = request.client.host if request.client else None
                await AuditService.log_action(
                    session=db,
                    user_id=current_user.id,
                    action="media.uploaded",
                    resource_type="media",
                    resource_id=media_id,
                    payload={
                        "filename": file.filename,
                        "mime_type": mime_type,
                        "media_type": media_type,
                        "size": len(content),
                        "url": media_url,
                    },
                    ip_address=client_ip,
                )
            except Exception:
                pass

        return {
            "status": "success",
            "media_id": media_id,
            "url": media_url,
            "filename": file.filename,
            "mime_type": mime_type,
            "media_type": media_type,
            "size": len(content),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Media upload error: {exc}")
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
