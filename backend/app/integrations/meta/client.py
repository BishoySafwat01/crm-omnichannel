from typing import Any, Optional
import httpx

from app.core.config import settings


class MetaAPIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class MetaClient:
    def __init__(
        self,
        page_id: Optional[str] = None,
        access_token: Optional[str] = None,
        api_version: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.page_id = settings.META_PAGE_ID if page_id is None else page_id
        self.access_token = settings.META_PAGE_ACCESS_TOKEN if access_token is None else access_token
        self.api_version = api_version or settings.META_GRAPH_API_VERSION
        self.base_url = f"https://graph.facebook.com/{self.api_version}"
        self.timeout = timeout

    def _ensure_authenticated(self) -> None:
        if not self.access_token or not self.access_token.strip():
            raise MetaAPIError(
                "META_PAGE_ACCESS_TOKEN is missing or unconfigured. Please configure it in .env.",
                status_code=401,
            )

    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        self._ensure_authenticated()

        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        query_params = params.copy() if params else {}
        query_params["access_token"] = self.access_token

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
        return await self._request("GET", f"/{target_page_id}", params={"fields": "id,name,category"})

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
            "fields": "id,link,updated_time,participants",
            "limit": limit,
        }
        if after:
            params["after"] = after

        return await self._request("GET", f"/{target_page_id}/conversations", params=params)

    async def get_messages(
        self,
        conversation_id: str,
        limit: int = 50,
        after: Optional[str] = None,
    ) -> dict[str, Any]:
        if not conversation_id:
            raise MetaAPIError("conversation_id is required.", status_code=400)

        params: dict[str, Any] = {
            "fields": "id,created_time,from,to,message,attachments",
            "limit": limit,
        }
        if after:
            params["after"] = after

        return await self._request("GET", f"/{conversation_id}/messages", params=params)

    async def get_user_profile(self, psid: str) -> dict[str, Any]:
        if not psid or not str(psid).strip():
            return {}
        try:
            return await self._request(
                "GET",
                f"/{psid}",
                params={"fields": "first_name,last_name,profile_pic,locale,timezone,gender"},
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
            return await self._request("POST", f"/{target_page_id}/messages", json_data=payload)
        except MetaAPIError as exc:
            # If tag is unapproved on Meta App dashboard (#100), retry with RESPONSE
            if tag and ("#100" in exc.message or "HUMAN_AGENT" in exc.message):
                fallback_payload = {
                    "recipient": {"id": recipient_id},
                    "messaging_type": "RESPONSE",
                    "message": {"text": text},
                }
                return await self._request("POST", f"/{target_page_id}/messages", json_data=fallback_payload)
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

        url = f"{self.base_url}/{target_page_id}/messages?access_token={self.access_token}"
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
