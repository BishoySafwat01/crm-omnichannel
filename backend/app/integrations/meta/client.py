from typing import Any, Optional
import httpx

from app.core.config import settings


class MetaAPIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class MetaClient:
    """Async HTTP Client for interacting with the Meta Graph API (Messenger, WhatsApp, Instagram)."""

    def __init__(
        self,
        page_id: Optional[str] = None,
        access_token: Optional[str] = None,
        api_version: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.page_id = page_id or settings.META_PAGE_ID
        self.access_token = access_token or (settings.get_page_token(page_id) if page_id else settings.META_PAGE_ACCESS_TOKEN)
        self.api_version = api_version or settings.META_GRAPH_API_VERSION
        self.base_url = f"https://graph.facebook.com/{self.api_version}"
        self.timeout = timeout

    def _ensure_authenticated(self, token: Optional[str] = None) -> None:
        active_token = token or self.access_token
        if not active_token or not active_token.strip():
            raise MetaAPIError(
                "META_PAGE_ACCESS_TOKEN is missing or unconfigured for the requested page.",
                status_code=401,
            )

    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
        page_id: Optional[str] = None,
        access_token: Optional[str] = None,
    ) -> dict[str, Any]:
        active_token = access_token or (settings.get_page_token(page_id) if page_id else self.access_token)
        self._ensure_authenticated(active_token)

        from app.integrations.meta.rate_limit import MetaRateLimitGuard

        if MetaRateLimitGuard.is_rate_limited():
            rem = MetaRateLimitGuard.get_cooldown_remaining()
            raise MetaAPIError(
                f"Meta API Error (429): Rate limit cooldown active ({int(rem)}s remaining). Please wait before retrying.",
                status_code=429,
            )

        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        query_params = params.copy() if params else {}
        query_params["access_token"] = active_token

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    params=query_params,
                    json=json_data,
                )
        except httpx.TimeoutException:
            raise MetaAPIError("Meta Graph API request timed out", status_code=504)
        except httpx.RequestError as exc:
            raise MetaAPIError(
                f"Meta Graph API connection error: {type(exc).__name__}",
                status_code=502,
            )

        MetaRateLimitGuard.inspect_response(response)

        if response.is_error:
            status_code = response.status_code
            try:
                err_json = response.json()
                err_detail = err_json.get("error", {}).get("message", response.text)
            except Exception:
                err_detail = f"HTTP {status_code}"

            # Never include access token in exception message
            sanitized_msg = str(err_detail)
            if self.access_token:
                sanitized_msg = sanitized_msg.replace(self.access_token, "[REDACTED_TOKEN]")

            raise MetaAPIError(
                f"Meta API Error ({status_code}): {sanitized_msg}",
                status_code=status_code,
            )

        try:
            return response.json()
        except Exception:
            raise MetaAPIError("Failed to parse Meta API response JSON", status_code=500)

    async def get_page_info(self, page_id: Optional[str] = None) -> dict[str, Any]:
        target_page_id = page_id or self.page_id
        if not target_page_id:
            raise MetaAPIError("META_PAGE_ID is missing or unconfigured.", status_code=400)
        return await self._request("GET", f"/{target_page_id}", params={"fields": "id,name,category,picture.type(large)"}, page_id=target_page_id)

    async def get_page_metadata(self, page_id: Optional[str] = None) -> dict[str, Any]:
        target_page_id = page_id or self.page_id
        if not target_page_id:
            raise MetaAPIError("META_PAGE_ID is missing or unconfigured.", status_code=400)
        data = await self._request(
            "GET",
            f"/{target_page_id}",
            params={"fields": "id,name,category,picture.type(large)"},
            page_id=target_page_id,
        )
        picture_url = None
        if isinstance(data, dict):
            pic_obj = data.get("picture", {})
            if isinstance(pic_obj, dict):
                picture_url = pic_obj.get("data", {}).get("url")
        return {
            "id": str(data.get("id", target_page_id)),
            "name": data.get("name", f"Page {target_page_id}"),
            "category": data.get("category", "Business"),
            "picture_url": picture_url,
            "raw": data,
        }

    async def subscribe_page_to_app(
        self,
        page_id: Optional[str] = None,
        access_token: Optional[str] = None,
        subscribed_fields: Optional[list[str]] = None,
        timeout: float = 10.0,
    ) -> dict[str, Any]:
        """
        Subscribe a Facebook Page to the CRM application's webhooks.
        Endpoint: POST https://graph.facebook.com/{version}/{page_id}/subscribed_apps

        Subscribed fields:
        ["messages", "messaging_postbacks", "feed", "message_deliveries", "message_reads"]

        Returns:
            dict: { "success": bool, "details": dict, "error": Optional[str] }
        """
        target_page_id = page_id or self.page_id
        target_token = access_token or self.access_token

        if not target_token or not str(target_token).strip():
            return {
                "success": False,
                "details": {},
                "error": "META_PAGE_ACCESS_TOKEN is missing or unconfigured.",
            }

        if not target_page_id or not str(target_page_id).strip():
            return {
                "success": False,
                "details": {},
                "error": "META_PAGE_ID is missing or unconfigured.",
            }

        fields_list = subscribed_fields or [
            "messages",
            "messaging_postbacks",
            "feed",
            "message_deliveries",
            "message_reads",
        ]
        fields_param = ",".join(fields_list) if isinstance(fields_list, list) else str(fields_list)

        url = f"{self.base_url}/{target_page_id}/subscribed_apps"
        params = {
            "subscribed_fields": fields_param,
            "access_token": target_token,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, params=params)

            try:
                resp_json = response.json()
            except Exception:
                resp_json = {"raw_text": response.text}

            if response.is_error:
                err_detail = (
                    resp_json.get("error", {}).get("message", response.text)
                    if isinstance(resp_json, dict)
                    else response.text
                )
                sanitized_msg = str(err_detail)
                if target_token:
                    sanitized_msg = sanitized_msg.replace(target_token, "[REDACTED_TOKEN]")
                return {
                    "success": False,
                    "details": resp_json if isinstance(resp_json, dict) else {"raw": str(resp_json)},
                    "error": f"Meta API Error ({response.status_code}): {sanitized_msg}",
                }

            is_success = bool(resp_json.get("success", False)) if isinstance(resp_json, dict) else False
            return {
                "success": is_success,
                "details": resp_json if isinstance(resp_json, dict) else {},
                "error": None if is_success else "Meta API response did not indicate success.",
            }

        except httpx.TimeoutException:
            return {
                "success": False,
                "details": {},
                "error": "Meta Graph API request timed out during webhook subscription.",
            }
        except httpx.RequestError as exc:
            return {
                "success": False,
                "details": {},
                "error": f"Meta Graph API connection error during subscription: {type(exc).__name__}",
            }
        except Exception as exc:
            sanitized_err = str(exc)
            if target_token:
                sanitized_err = sanitized_err.replace(target_token, "[REDACTED_TOKEN]")
            return {
                "success": False,
                "details": {},
                "error": f"Unexpected error during webhook subscription: {sanitized_err}",
            }

    async def get_conversations(
        self,
        page_id: Optional[str] = None,
        limit: int = 25,
        after: Optional[str] = None,
    ) -> dict[str, Any]:
        target_page_id = page_id or self.page_id
        if not target_page_id:
            raise MetaAPIError("META_PAGE_ID is missing or unconfigured.", status_code=400)

        params: dict[str, Any] = {
            "fields": "id,link,updated_time,participants,unread_count",
            "limit": limit,
        }
        if after:
            params["after"] = after

        return await self._request("GET", f"/{target_page_id}/conversations", params=params, page_id=target_page_id)

    async def get_messages(
        self,
        conversation_id: str,
        limit: int = 50,
        after: Optional[str] = None,
        page_id: Optional[str] = None,
    ) -> dict[str, Any]:
        if not conversation_id:
            raise MetaAPIError("conversation_id is required.", status_code=400)

        params: dict[str, Any] = {
            "fields": "id,created_time,from,to,message,attachments,shares",
            "limit": limit,
        }
        if after:
            params["after"] = after

        return await self._request("GET", f"/{conversation_id}/messages", params=params, page_id=page_id)

    async def get_user_profile(self, psid: str, page_id: Optional[str] = None) -> dict[str, Any]:
        if not psid or not str(psid).strip():
            return {}
        try:
            return await self._request(
                "GET",
                f"/{psid}",
                params={"fields": "first_name,last_name,profile_pic,locale,timezone,gender"},
                page_id=page_id,
            )
        except Exception:
            return {}

    async def send_message(
        self,
        recipient_id: str,
        text: str,
        page_id: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> dict[str, Any]:
        target_page_id = page_id or self.page_id
        if not target_page_id:
            raise MetaAPIError("META_PAGE_ID is missing or unconfigured.", status_code=400)

        if not recipient_id or not str(recipient_id).strip():
            raise MetaAPIError("recipient_id is required for sending messages.", status_code=400)

        if not text or not str(text).strip():
            raise MetaAPIError("Message text cannot be empty or whitespace only.", status_code=400)

        payload: dict[str, Any] = {
            "recipient": {"id": recipient_id},
            "message": {"text": text},
        }

        if tag:
            payload["messaging_type"] = "MESSAGE_TAG"
            payload["tag"] = tag
        else:
            payload["messaging_type"] = "RESPONSE"

        try:
            return await self._request("POST", f"/{target_page_id}/messages", json_data=payload, page_id=target_page_id)
        except MetaAPIError as exc:
            # If tag is unapproved on Meta App dashboard (#100), retry with RESPONSE
            if tag and ("#100" in exc.message or "HUMAN_AGENT" in exc.message):
                fallback_payload = {
                    "recipient": {"id": recipient_id},
                    "messaging_type": "RESPONSE",
                    "message": {"text": text},
                }
                return await self._request("POST", f"/{target_page_id}/messages", json_data=fallback_payload, page_id=target_page_id)
            raise

    async def send_attachment_message(
        self,
        recipient_id: str,
        file_path: str,
        attachment_type: str = "audio",
        page_id: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> dict[str, Any]:
        import json
        import os

        target_page_id = page_id or self.page_id
        if not target_page_id:
            raise MetaAPIError("META_PAGE_ID is missing or unconfigured.", status_code=400)

        if not recipient_id or not str(recipient_id).strip():
            raise MetaAPIError("recipient_id is required for sending messages.", status_code=400)

        filename = os.path.basename(file_path)
        if not os.path.exists(file_path):
            alt_path1 = os.path.join(settings.UPLOAD_DIR, filename)
            alt_path2 = os.path.join("/app/uploads", filename)
            if os.path.exists(alt_path1):
                file_path = alt_path1
            elif os.path.exists(alt_path2):
                file_path = alt_path2
            else:
                raise MetaAPIError(f"Attachment file not found at path: {file_path}", status_code=400)

        ext_lower = filename.lower()
        mime_type = "application/octet-stream"
        if ext_lower.endswith(".png"):
            mime_type = "image/png"
        elif ext_lower.endswith(".jpg") or ext_lower.endswith(".jpeg"):
            mime_type = "image/jpeg"
        elif ext_lower.endswith(".webp"):
            mime_type = "image/webp"
        elif ext_lower.endswith(".gif"):
            mime_type = "image/gif"
        elif ext_lower.endswith(".ogg") or ext_lower.endswith(".opus"):
            mime_type = "audio/ogg"
        elif ext_lower.endswith(".mp3"):
            mime_type = "audio/mp3"
        elif ext_lower.endswith(".m4a") or ext_lower.endswith(".mp4"):
            mime_type = "audio/mp4"
        elif ext_lower.endswith(".webm"):
            mime_type = "audio/webm"
        elif ext_lower.endswith(".pdf"):
            mime_type = "application/pdf"

        if mime_type.startswith("image/"):
            attachment_type = "image"
        elif mime_type.startswith("audio/"):
            attachment_type = "audio"

        with open(file_path, "rb") as f:
            file_bytes = f.read()

        payload_data = {
            "recipient": json.dumps({"id": recipient_id}),
            "message": json.dumps({"attachment": {"type": attachment_type, "payload": {"is_reusable": True}}}),
        }

        if tag:
            payload_data["messaging_type"] = "MESSAGE_TAG"
            payload_data["tag"] = tag
        else:
            payload_data["messaging_type"] = "RESPONSE"

        token = settings.get_page_token(target_page_id) if target_page_id else self.access_token
        url = f"{self.base_url}/{target_page_id}/messages?access_token={token}"
        files = {"filedata": (filename, file_bytes, mime_type)}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, data=payload_data, files=files)

            if response.is_error:
                err_detail = response.text
                try:
                    err_json = response.json()
                    err_detail = err_json.get("error", {}).get("message", response.text)
                except Exception:
                    pass

                if tag and ("#100" in err_detail or "HUMAN_AGENT" in err_detail):
                    payload_data["messaging_type"] = "RESPONSE"
                    payload_data.pop("tag", None)
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        response = await client.post(url, data=payload_data, files=files)

            if response.is_error:
                err_detail = response.text
                try:
                    err_json = response.json()
                    err_detail = err_json.get("error", {}).get("message", response.text)
                except Exception:
                    pass
                sanitized_msg = str(err_detail)
                if self.access_token:
                    sanitized_msg = sanitized_msg.replace(self.access_token, "[REDACTED_TOKEN]")
                raise MetaAPIError(
                    f"Meta Media Upload Error ({response.status_code}): {sanitized_msg}",
                    status_code=response.status_code,
                )

            return response.json()
        except Exception as exc:
            if isinstance(exc, MetaAPIError):
                raise
            raise MetaAPIError(f"Failed to send binary media attachment to Meta: {str(exc)}", status_code=500)

    async def send_whatsapp_message(
        self, recipient_phone: str, text: str
    ) -> dict[str, Any]:
        phone_number_id = getattr(settings, "META_WHATSAPP_PHONE_ID", None) or self.page_id
        if not phone_number_id:
            raise MetaAPIError("META_WHATSAPP_PHONE_ID or META_PAGE_ID is missing.", status_code=400)

        clean_phone = recipient_phone.replace("+", "").replace(" ", "").strip()

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {"preview_url": False, "body": text}
        }

        try:
            return await self._request("POST", f"/{phone_number_id}/messages", json_data=payload)
        except Exception as exc:
            if isinstance(exc, MetaAPIError):
                raise
            raise MetaAPIError(f"Failed to send WhatsApp message: {str(exc)}", status_code=500)

    async def publish_page_post(
        self,
        message: str,
        link: Optional[str] = None,
        image_url: Optional[str] = None,
    ) -> dict[str, Any]:
        """Publish a post to the Facebook Page with Click-to-Chat CTA."""
        page_id = self.page_id
        if not page_id:
            raise MetaAPIError("META_PAGE_ID is missing or unconfigured.", status_code=400)

        payload: dict[str, Any] = {
            "message": message,
            "call_to_action": {
                "type": "MESSAGE_PAGE",
                "value": {"app_destination": "MESSENGER"}
            }
        }
        if link:
            payload["link"] = link
        if image_url:
            payload["picture"] = image_url

        try:
            return await self._request("POST", f"/{page_id}/feed", json_data=payload)
        except Exception as exc:
            if isinstance(exc, MetaAPIError):
                raise
            raise MetaAPIError(f"Failed to publish Facebook Page post: {str(exc)}", status_code=500)

    async def hide_comment(self, comment_id: str, is_hidden: bool = True) -> dict[str, Any]:
        """Hide or unhide a social media comment."""
        try:
            return await self._request("POST", f"/{comment_id}", params={"is_hidden": str(is_hidden).lower()})
        except Exception as exc:
            if isinstance(exc, MetaAPIError):
                raise
            raise MetaAPIError(f"Failed to hide comment {comment_id}: {str(exc)}", status_code=500)

    async def delete_comment(self, comment_id: str) -> dict[str, Any]:
        """Delete a social media comment."""
        try:
            return await self._request("DELETE", f"/{comment_id}")
        except Exception as exc:
            if isinstance(exc, MetaAPIError):
                raise
            raise MetaAPIError(f"Failed to delete comment {comment_id}: {str(exc)}", status_code=500)

    async def reply_to_comment(self, comment_id: str, message: str) -> dict[str, Any]:
        """Publish a public reply to a social media comment."""
        try:
            return await self._request("POST", f"/{comment_id}/comments", json_data={"message": message})
        except Exception as exc:
            if isinstance(exc, MetaAPIError):
                raise
            raise MetaAPIError(f"Failed to reply to comment {comment_id}: {str(exc)}", status_code=500)

    async def send_private_reply(self, comment_id: str, message: str) -> dict[str, Any]:
        """Send a private Messenger DM in response to a public comment."""
        page_id = self.page_id
        if not page_id:
            raise MetaAPIError("META_PAGE_ID is missing or unconfigured.", status_code=400)
        payload = {
            "recipient": {"comment_id": comment_id},
            "message": {"text": message},
        }
        try:
            return await self._request("POST", f"/{page_id}/messages", json_data=payload)
        except Exception as exc:
            if isinstance(exc, MetaAPIError):
                raise
            raise MetaAPIError(f"Failed to send private reply for comment {comment_id}: {str(exc)}", status_code=500)

    async def get_post_details(self, post_id: str) -> dict[str, Any]:
        """Fetch post metadata including permalink_url, full_picture, message, and attachments."""
        if not post_id or post_id == "post_unknown":
            return {}
        try:
            return await self._request(
                "GET",
                f"/{post_id}",
                params={"fields": "permalink_url,full_picture,message,attachments"},
            )
        except Exception:
            return {}

    async def delete_message(self, message_id: str) -> dict[str, Any]:
        """Attempt to delete/unsend a message via Meta Graph API if supported."""
        if not message_id:
            return {}
        try:
            return await self._request("DELETE", f"/{message_id}")
        except Exception as e:
            return {"error": str(e)}



