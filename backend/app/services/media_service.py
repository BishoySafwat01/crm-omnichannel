import logging
import os
import subprocess

logger = logging.getLogger(__name__)


def convert_audio_to_m4a(input_path: str) -> str:
    """Transcode WebM/OGG/WAV audio files to M4A (AAC codec) for iOS Messenger compatibility."""
    if not input_path or not os.path.exists(input_path):
        return input_path

    filename = os.path.basename(input_path)
    base, ext = os.path.splitext(filename)
    if ext.lower() in [".m4a", ".mp4", ".aac"]:
        return input_path

    output_path = os.path.join(os.path.dirname(input_path), f"{base}.m4a")
    if os.path.exists(output_path):
        return output_path

    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-ar",
            "44100",
            output_path,
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        logger.info("Successfully transcoded audio via ffmpeg: %s -> %s", input_path, output_path)
        return output_path
    except Exception as err:
        logger.warning("FFmpeg audio transcoding failed for %s: %s", input_path, str(err))
        return input_path
