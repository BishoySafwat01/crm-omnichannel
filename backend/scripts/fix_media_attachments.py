import asyncio
import logging
import os
import subprocess
import httpx
from sqlalchemy import select, or_
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.models.message import Message
from app.models.enums import MessageTypeEnum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_media_attachments")

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def detect_audio_extension(file_path: str) -> str:
    try:
        with open(file_path, "rb") as f:
            header = f.read(16)
        if header.startswith(b"OggS"):
            return ".ogg"
        if b"ftyp" in header or header.startswith(b"\x00\x00\x00"):
            return ".m4a"
        if header.startswith(b"ID3") or header.startswith(b"\xff\xfb"):
            return ".mp3"
    except Exception:
        pass
    return ".m4a"


def transcode_to_m4a(input_path: str, output_path: str) -> bool:
    try:
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-vn", "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
            output_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception as e:
        logger.warning("[FFmpeg] Transcoding error for %s: %s", input_path, e)
        return False


async def fix_media_attachments():
    logger.info("[Media Fix] Scanning messages and uploads directory: %s", UPLOAD_DIR)

    async with AsyncSessionLocal() as session:
        stmt = select(Message)
        messages = (await session.execute(stmt)).scalars().all()
        logger.info("[Media Fix] Scanning %d potential media messages...", len(messages))

        headers = {"Authorization": f"Bearer {settings.META_PAGE_ACCESS_TOKEN}"} if settings.META_PAGE_ACCESS_TOKEN else {}

        fixed_count = 0
        for msg in messages:
            meta = dict(msg.metadata_ or {})
            url = meta.get("media_url") or (msg.text if msg.text and msg.text.startswith("/uploads/") else None)

            # Check attachments array in metadata
            atts = list(meta.get("attachments", []))
            if not url and atts and isinstance(atts[0], dict):
                url = atts[0].get("url")

            if not url:
                continue

            # Case 1: External Meta CDN URL -> Download and transcode
            if url.startswith("http://") or url.startswith("https://"):
                try:
                    ext = ".m4a" if ("audio" in str(msg.message_type) or "voice" in url or "audioclip" in url) else ".jpg"
                    local_filename = f"media_{msg.id.hex[:12]}{ext}"
                    local_disk_path = os.path.join(UPLOAD_DIR, local_filename)

                    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                        resp = await client.get(url, headers=headers)
                        if resp.status_code == 200:
                            with open(local_disk_path, "wb") as f:
                                f.write(resp.content)

                            # If audio, transcode to ensure cross-platform AAC compatibility
                            if ext == ".m4a" or msg.message_type == MessageTypeEnum.AUDIO or "audioclip" in url:
                                final_m4a = os.path.join(UPLOAD_DIR, f"voice_{msg.id.hex[:12]}.m4a")
                                if transcode_to_m4a(local_disk_path, final_m4a):
                                    local_disk_path = final_m4a
                                    local_filename = os.path.basename(final_m4a)

                            mapped_url = f"/uploads/{local_filename}"
                            msg.message_type = MessageTypeEnum.AUDIO if ("voice" in local_filename or ext == ".m4a") else MessageTypeEnum.IMAGE
                            meta["media_url"] = mapped_url
                            meta["media_type"] = "audio" if msg.message_type == MessageTypeEnum.AUDIO else "image"
                            meta["attachments"] = [{
                                "url": mapped_url,
                                "type": "audio" if msg.message_type == MessageTypeEnum.AUDIO else "image",
                                "filename": local_filename
                            }]
                            msg.metadata_ = meta
                            fixed_count += 1
                            logger.info("[Media Fix] Downloaded & mapped %s -> %s", msg.id, mapped_url)
                except Exception as ex:
                    logger.warning("[Media Fix] Failed to download %s: %s", url, ex)

            # Case 2: Local path exists but needs codec verification
            elif url.startswith("/uploads/"):
                disk_path = os.path.join(UPLOAD_DIR, os.path.basename(url))
                if os.path.exists(disk_path) and os.path.getsize(disk_path) > 0:
                    if msg.message_type in [MessageTypeEnum.AUDIO, MessageTypeEnum.UNKNOWN] or "voice" in url or "audioclip" in url:
                        if not url.endswith(".m4a"):
                            target_m4a = os.path.join(UPLOAD_DIR, f"{os.path.splitext(os.path.basename(url))[0]}.m4a")
                            if transcode_to_m4a(disk_path, target_m4a):
                                mapped_url = f"/uploads/{os.path.basename(target_m4a)}"
                                msg.message_type = MessageTypeEnum.AUDIO
                                meta["media_url"] = mapped_url
                                meta["media_type"] = "audio"
                                meta["attachments"] = [{
                                    "url": mapped_url,
                                    "type": "audio",
                                    "filename": os.path.basename(target_m4a)
                                }]
                                msg.metadata_ = meta
                                fixed_count += 1
                                logger.info("[Media Fix] Transcoded existing audio to M4A: %s", mapped_url)

        await session.commit()
        logger.info("[Media Fix] Complete! Updated %d media records.", fixed_count)


if __name__ == "__main__":
    asyncio.run(fix_media_attachments())
