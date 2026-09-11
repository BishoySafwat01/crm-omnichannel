import logging
from typing import Any, Optional
import httpx

from app.core.config import settings

logger = logging.getLogger("app.integrations.beon.client")


class BeonAPIError(Exception):
    """Exception raised when BeOn API returns an error."""

    def __init__(self, message: str, status_code: int = 400, details: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class BeonClient:
    """Async HTTP Client for BeOn V3 Partner API."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 15.0,
    ):
        self.api_key = api_key or settings.BEON_API_KEY
        self.base_url = (base_url or settings.BEON_API_BASE_URL).rstrip("/")
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        if not self.api_key or not self.api_key.strip():
            raise BeonAPIError("BEON_API_KEY is not configured.", status_code=500)
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "beon-token": self.api_key.strip(),
        }

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=self._headers(),
                    params=params,
                    json=json_data,
                )
                if response.status_code >= 400:
                    try:
                        err_payload = response.json()
                        msg = (
                            err_payload.get("message")
                            or err_payload.get("error")
                            or response.text
                        )
                    except Exception:
                        err_payload = None
                        msg = response.text
                    logger.error(
                        f"BeOn API error: {method} {path} -> {response.status_code}: {msg}"
                    )
                    raise BeonAPIError(
                        message=f"BeOn API error ({response.status_code}): {msg}",
                        status_code=response.status_code,
                        details=err_payload,
                    )
                return response.json()
            except httpx.RequestError as exc:
                logger.error(f"BeOn network connection error: {exc}")
                raise BeonAPIError(
                    message=f"Failed to connect to BeOn API: {str(exc)}",
                    status_code=503,
                )

    async def get_account_details(self) -> dict[str, Any]:
        """Fetch partner account overview, active limits, and metadata."""
        return await self._request("GET", "/partner/account")

    async def get_conversations(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[str] = None,
        channel: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        """Fetch paginated conversations from BeOn."""
        params: dict[str, Any] = {"page": page, "per_page": per_page}
        if status:
            params["status"] = status
        if channel:
            params["channel"] = channel
        if search:
            params["search"] = search
        return await self._request("GET", "/partner/conversation", params=params)

    async def get_conversation_messages(
        self,
        conversation_id: int | str,
        page: int = 1,
        per_page: int = 50,
    ) -> dict[str, Any]:
        """Fetch paginated messages within a specific conversation."""
        params = {"page": page, "per_page": per_page}
        return await self._request(
            "GET", f"/partner/conversation/details/{conversation_id}", params=params
        )

    async def send_whatsapp_template(
        self,
        phone_number: str,
        name: str,
        template_id: int,
        template_vars: Optional[list[Any]] = None,
        header: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Dispatch a WhatsApp HSM approved template."""
        payload: dict[str, Any] = {
            "phoneNumber": phone_number,
            "name": name,
            "template_id": template_id,
            "template_vars": template_vars or [],
        }
        if header:
            payload["header"] = header
        return await self._request(
            "POST", "/partner/messages/whatsapp/template", json_data=payload
        )

    async def send_sms_template(
        self,
        phone_number: str,
        name: str,
        template_id: int,
        template_vars: Optional[list[Any]] = None,
    ) -> dict[str, Any]:
        """Dispatch an SMS template message."""
        payload = {
            "phoneNumber": phone_number,
            "name": name,
            "template_id": template_id,
            "vars": template_vars or [],
        }
        return await self._request(
            "POST", "/v3/messages/sms/template", json_data=payload
        )

    async def send_otp(
        self,
        phone_number: str,
        name: str,
        otp_type: str = "sms",
        length: int = 6,
    ) -> dict[str, Any]:
        """Send one-time password (OTP) verification."""
        payload = {
            "phoneNumber": phone_number,
            "name": name,
            "otp_type": otp_type,
            "length": length,
        }
        return await self._request("POST", "/v3/messages/otp", json_data=payload)

    async def create_or_update_contact(
        self,
        phone: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        tags: Optional[list[int]] = None,
    ) -> dict[str, Any]:
        """Create or update a contact in BeOn."""
        payload: dict[str, Any] = {"phone": phone}
        if name:
            payload["name"] = name
        if email:
            payload["email"] = email
        if tags:
            payload["tags"] = tags
        return await self._request("POST", "/partner/contacts/create", json_data=payload)

    async def get_tags(self) -> list[dict[str, Any]]:
        """Fetch existing contact tags from BeOn."""
        res = await self._request("GET", "/partner/contacts/tags")
        return res.get("data", [])

    async def send_message(
        self,
        contact_id: int | str,
        message: str,
        channel_id: Optional[int | str] = None,
    ) -> dict[str, Any]:
        """Send an outbound agent message to a contact/conversation in BeOn."""
        payload: dict[str, Any] = {
            "contact_id": int(contact_id) if str(contact_id).isdigit() else contact_id,
            "message": message,
        }
        if channel_id:
            payload["channel_id"] = (
                int(channel_id) if str(channel_id).isdigit() else channel_id
            )
        return await self._request(
            "POST", "/partner/conversation/create", json_data=payload
        )
