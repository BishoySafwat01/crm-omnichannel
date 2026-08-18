import os
import uuid
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.core.config import settings

router = APIRouter(prefix="/media", tags=["media"])

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)


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
