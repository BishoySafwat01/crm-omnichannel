import logging
import os
import uuid
from typing import Optional
import httpx

from app.core.config import settings

logger = logging.getLogger("app.infrastructure.storage.media_storage_gateway")


class MediaStorageGateway:
    """Infrastructure Gateway for downloading, inspecting, and persisting remote media attachments."""

    @staticmethod
    def detect_media_type(content: bytes) -> str:
        """Sniff MIME type from binary content magic bytes."""
        if not content or len(content) < 4:
            return "application/octet-stream"

        header = content[:16]
        if header.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if header.startswith(b"RIFF") and b"WEBP" in header:
            return "image/webp"
        if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
            return "image/gif"
        if header.startswith(b"OggS"):
            return "audio/ogg"
        if header.startswith(b"ID3") or header.startswith(b"\xff\xfb"):
            return "audio/mpeg"
        if header.startswith(b"%PDF"):
            return "application/pdf"
        if b"ftyp" in header or header.startswith(b"\x00\x00\x00"):
            return "video/mp4"

        return "application/octet-stream"

    @classmethod
    def detect_extension(cls, content: bytes, media_type: str = "file") -> str:
        """Resolve suitable file extension based on magic bytes and requested media category."""
        mime = cls.detect_media_type(content)
        if mime == "image/jpeg":
            return ".jpg"
        if mime == "image/png":
            return ".png"
        if mime == "image/webp":
            return ".webp"
        if mime == "image/gif":
            return ".gif"
        if mime == "audio/ogg":
            return ".ogg"
        if mime == "audio/mpeg":
            return ".mp3"
        if mime == "application/pdf":
            return ".pdf"
        if mime == "video/mp4":
            if "audio" in media_type:
                return ".m4a"
            return ".mp4"

        # Fallback based on declared media_type category
        if "video" in media_type:
            return ".mp4"
        if "image" in media_type:
            return ".jpg"
        if "audio" in media_type:
            return ".m4a"
        return ".bin"

    @classmethod
    async def download_and_cache_remote_media(
        cls,
        url: str,
        subfolder: str = "attachments",
        media_type: str = "file",
        auth_token: Optional[str] = None,
    ) -> Optional[str]:
        """Download remote asset and store it on local filesystem storage.
        Returns the web-accessible static path (/uploads/...) or the original URL on failure/non-HTTP.
        """
        if not url or not isinstance(url, str) or not url.startswith("http"):
            return url

        try:
            url_lower = url.lower()
            prefix = "media_"
            ext = ".bin"

            if "video" in media_type:
                ext = ".mp4"
                prefix = "vid_"
            elif "image" in media_type:
                ext = ".jpg"
                prefix = "img_"
            elif "audio" in media_type:
                ext = ".m4a"
                prefix = "voice_"
            elif ".jpg" in url_lower or ".jpeg" in url_lower:
                ext = ".jpg"
                prefix = "img_"
            elif ".png" in url_lower:
                ext = ".png"
                prefix = "img_"
            elif ".webp" in url_lower:
                ext = ".webp"
                prefix = "img_"
            elif ".gif" in url_lower:
                ext = ".gif"
                prefix = "img_"
            elif ".mp3" in url_lower or ".ogg" in url_lower or ".m4a" in url_lower:
                ext = ".m4a"
                prefix = "voice_"
            elif ".mp4" in url_lower:
                ext = ".mp4"
                prefix = "vid_"
            elif ".pdf" in url_lower:
                ext = ".pdf"
                prefix = "doc_"

            base_uploads = settings.UPLOAD_DIR
            clean_subfolder = (subfolder or "").strip().strip("/")
            target_dir = os.path.join(base_uploads, clean_subfolder) if clean_subfolder else base_uploads
            os.makedirs(target_dir, exist_ok=True)

            headers = {}
            token = auth_token or settings.META_PAGE_ACCESS_TOKEN
            if token and any(domain in url for domain in ("facebook.com", "fbcdn.net", "fbsbx.com", "cdninstagram.com")):
                headers["Authorization"] = f"Bearer {token}"

            async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
                resp = await client.get(url, headers=headers)

                if resp.status_code == 200 and len(resp.content) > 100:
                    if not resp.content.startswith(b"<!DOCTYPE") and not resp.content.startswith(b"{\"error\""):
                        refined_ext = cls.detect_extension(resp.content, media_type=media_type)
                        filename = f"{prefix}{uuid.uuid4().hex[:12]}{refined_ext}"
                        upload_path = os.path.join(target_dir, filename)

                        with open(upload_path, "wb") as f:
                            f.write(resp.content)

                        if clean_subfolder:
                            return f"/uploads/{clean_subfolder}/{filename}"
                        return f"/uploads/{filename}"
                    else:
                        logger.error("[MediaStorageGateway] Remote CDN returned non-binary error payload: %s", resp.text[:200])
                else:
                    logger.warning("[MediaStorageGateway] Remote fetch returned HTTP %s for url: %s", resp.status_code, url)
        except Exception as exc:
            logger.warning("[MediaStorageGateway] Failed to download and cache remote media (%s): %s", url, exc)

        return url


# Default singleton instance
media_storage_gateway = MediaStorageGateway()
