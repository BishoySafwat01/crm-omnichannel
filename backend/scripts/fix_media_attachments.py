import asyncio
import logging
import os
import shutil
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.models.message import Message
from app.models.enums import MessageTypeEnum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_media_attachments")


async def fix_media_attachments():
    uploads_dir = settings.UPLOAD_DIR
    logger.info("Scanning messages and uploads directory: %s", uploads_dir)

    # 1. Fix disk files missing extensions using header magic bytes
    if os.path.exists(uploads_dir):
        for fname in os.listdir(uploads_dir):
            fpath = os.path.join(uploads_dir, fname)
            if os.path.isfile(fpath) and not os.path.splitext(fname)[1]:
                new_name = None
                try:
                    with open(fpath, "rb") as f:
                        header = f.read(16)
                    if header.startswith(b"\xff\xd8\xff"):
                        new_name = f"{fname}.jpg"
                    elif header.startswith(b"\x89PNG"):
                        new_name = f"{fname}.png"
                    elif b"ftyp" in header or header.startswith(b"OggS"):
                        new_name = f"{fname}.m4a"
                except Exception as e:
                    logger.warning("Error reading file header for %s: %s", fname, e)

                if new_name:
                    new_fpath = os.path.join(uploads_dir, new_name)
                    if not os.path.exists(new_fpath):
                        shutil.move(fpath, new_fpath)
                        logger.info("Renamed disk file missing extension: %s -> %s", fname, new_name)

    # 2. Update DB records
    async with AsyncSessionLocal() as session:
        stmt = select(Message)
        res = await session.execute(stmt)
        messages = list(res.scalars().all())

        fixed_images = 0
        fixed_audio = 0

        for msg in messages:
            meta = dict(msg.metadata_ or {})
            atts = list(meta.get("attachments", []))
            text_val = (msg.text or "").strip()
            media_url = meta.get("media_url") or getattr(msg, "media_url", None) or ""

            # Check if text held a raw filename
            if not atts and (text_val.startswith("image-") or text_val.startswith("/uploads/") or any(text_val.endswith(ext) for ext in [".ogg", ".mp4", ".m4a", ".webm", ".jpg", ".png", ".jpeg", ".webp"])):
                url_val = text_val if text_val.startswith("/uploads/") else f"/uploads/{text_val}"
                is_img = "image" in url_val or url_val.endswith((".jpg", ".png", ".jpeg", ".webp"))
                atts = [{
                    "url": url_val,
                    "type": "image" if is_img else "audio",
                    "filename": text_val,
                    "mime_type": "image/jpeg" if is_img else "audio/m4a"
                }]
                meta["attachments"] = atts
                meta["media_url"] = url_val
                meta["media_type"] = "image" if is_img else "audio"

            is_image = False
            is_audio = False

            new_atts = []
            for att in atts:
                if not isinstance(att, dict):
                    continue
                att_dict = dict(att)
                raw_url_val = att_dict.get("url") or ""
                url = str(raw_url_val).lower()
                title = str(att_dict.get("title") or att_dict.get("filename") or "").lower()
                att_type = str(att_dict.get("type") or "").lower()

                if (
                    "image" in att_type
                    or "image-" in url
                    or "image-" in title
                    or any(url.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"])
                ):
                    is_image = True
                    att_dict["type"] = "image"
                    att_dict["mime_type"] = "image/jpeg"

                    raw_filename = os.path.basename(str(raw_url_val))
                    if raw_filename and not os.path.splitext(raw_filename)[1]:
                        new_filename = f"{raw_filename}.jpg"
                        att_dict["url"] = f"/uploads/{new_filename}"

                elif (
                    "audio" in att_type
                    or any(url.endswith(ext) for ext in [".m4a", ".mp4", ".webm", ".ogg", ".opus", ".wav", ".mp3"])
                    or "voice" in title
                ):
                    is_audio = True
                    att_dict["type"] = "audio"
                    att_dict["mime_type"] = "audio/m4a"

                new_atts.append(att_dict)

            raw_url = str(media_url).lower()
            if "image-" in raw_url or "img-" in raw_url:
                is_image = True
            elif any(raw_url.endswith(ext) for ext in [".mp4", ".m4a", ".webm", ".ogg", ".wav"]):
                is_audio = True

            if is_image:
                msg.message_type = MessageTypeEnum.IMAGE
                meta["attachments"] = new_atts
                msg.metadata_ = meta
                fixed_images += 1
            elif is_audio:
                msg.message_type = MessageTypeEnum.AUDIO
                meta["attachments"] = new_atts
                msg.metadata_ = meta
                fixed_audio += 1

        await session.commit()
        logger.info(
            "Repair complete! Updated %d image messages and %d audio messages.",
            fixed_images,
            fixed_audio,
        )


if __name__ == "__main__":
    asyncio.run(fix_media_attachments())
