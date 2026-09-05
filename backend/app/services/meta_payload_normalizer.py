import re
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class NormalizedMessage:
    text: Optional[str]
    message_type: str  # text, image, video, audio, share_reel, share_post, file
    media_url: Optional[str]
    metadata: Dict[str, Any]


class MetaPayloadNormalizer:
    @staticmethod
    def normalize_instagram_message(raw_msg: Dict[str, Any]) -> Optional[NormalizedMessage]:
        raw_text = (raw_msg.get("message") or "").strip()
        shares = raw_msg.get("shares", {}).get("data", [])
        attachments = raw_msg.get("attachments", {}).get("data", [])

        # 1. Inspect Shares Node
        if shares:
            share = shares[0]
            link = (share.get("link") or "").strip()
            clean_url = re.sub(r"^/+", "", link) if link else None
            is_reel = "reel" in clean_url if clean_url else True

            return NormalizedMessage(
                text=raw_text if raw_text else None,
                message_type="share_reel" if is_reel else "share_post",
                media_url=clean_url or "https://www.instagram.com",
                metadata={
                    "share_id": share.get("id"),
                    "name": share.get("name"),
                    "is_reel": is_reel,
                    "attachments": attachments,
                    "shares": shares,
                },
            )

        # 2. Inspect Attachments Node (target, video_data, image_data, file_url)
        if attachments:
            att = attachments[0]

            # Check for shared Target URL (Common for Instagram Direct Reels & Stories)
            target_url = att.get("target", {}).get("url") or att.get("url")
            if target_url:
                clean_target = re.sub(r"^/+", "", target_url.strip())
                is_reel = "reel" in clean_target or "instagram.com" in clean_target
                return NormalizedMessage(
                    text=raw_text if raw_text else None,
                    message_type="share_reel" if is_reel else "share_post",
                    media_url=clean_target,
                    metadata={
                        "target_id": att.get("target", {}).get("id"),
                        "attachments": attachments,
                        "shares": shares,
                    },
                )

            # Video / Reel attachment
            if "video_data" in att:
                v_url = att["video_data"].get("url")
                return NormalizedMessage(
                    text=raw_text if raw_text else None,
                    message_type="video",
                    media_url=v_url,
                    metadata={
                        "preview_url": att["video_data"].get("preview_url"),
                        "attachments": attachments,
                        "shares": shares,
                    },
                )

            # Image attachment
            if "image_data" in att:
                img_url = att["image_data"].get("url")
                return NormalizedMessage(
                    text=raw_text if raw_text else None,
                    message_type="image",
                    media_url=img_url,
                    metadata={
                        "preview_url": att["image_data"].get("preview_url"),
                        "attachments": attachments,
                        "shares": shares,
                    },
                )

            # Audio stream verification
            if "file_url" in att:
                f_url = att.get("file_url", "")
                mime = (att.get("mime_type") or "").lower()
                if "audio" in mime or any(
                    f_url.endswith(ext) for ext in [".m4a", ".mp3", ".aac", ".wav", ".ogg"]
                ):
                    return NormalizedMessage(
                        text=raw_text if raw_text else None,
                        message_type="audio",
                        media_url=f_url,
                        metadata={"mime_type": mime, "attachments": attachments, "shares": shares},
                    )

                return NormalizedMessage(
                    text=raw_text if raw_text else None,
                    message_type="file",
                    media_url=f_url,
                    metadata={
                        "mime_type": mime,
                        "name": att.get("name"),
                        "attachments": attachments,
                        "shares": shares,
                    },
                )

        # 3. Inspect Text for standalone URLs
        url_match = re.search(r"https?://(?:www\.)?instagram\.com/[^\s]+", raw_text)
        if url_match:
            clean_url = url_match.group(0).rstrip("/")
            is_reel = "/reel" in clean_url
            return NormalizedMessage(
                text=None,
                message_type="share_reel" if is_reel else "share_post",
                media_url=clean_url,
                metadata={"is_reel": is_reel, "attachments": attachments, "shares": shares},
            )

        # 4. Standard Text
        if raw_text:
            return NormalizedMessage(
                text=raw_text,
                message_type="text",
                media_url=None,
                metadata={"attachments": attachments, "shares": shares},
            )

        # If payload contains absolutely no renderable data, discard
        return None
