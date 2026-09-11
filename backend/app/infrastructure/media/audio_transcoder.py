import logging
import os
import subprocess

logger = logging.getLogger("app.infrastructure.media.audio_transcoder")


def detect_audio_extension(file_path: str) -> str:
    """Detect audio container/format from file header magic bytes."""
    try:
        with open(file_path, "rb") as f:
            header = f.read(16)
        if header.startswith(b"OggS"):
            return ".ogg"
        if b"ftyp" in header or header.startswith(b"\x00\x00\x00"):
            return ".m4a"
        if header.startswith(b"ID3") or header.startswith(b"\xff\xfb"):
            return ".mp3"
    except Exception as exc:
        logger.debug("[detect_audio_extension] Failed to read header for %s: %s", file_path, exc)
    return ".m4a"


def transcode_to_m4a(input_path: str, output_path: str) -> bool:
    """Transcode input audio file to AAC/M4A format using FFmpeg.
    Ensures broad compatibility across browsers and mobile clients.
    """
    try:
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-vn", "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception as exc:
        logger.warning("[FFmpeg] Transcoding error for %s -> %s: %s", input_path, output_path, exc)
        return False
