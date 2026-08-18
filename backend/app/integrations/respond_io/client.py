from typing import Any, Optional
import httpx

from app.core.config import settings


class RespondIoAPIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class RespondIoClient:
    def __init__(
        self,
        api_token: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.api_token = settings.RESPOND_IO_API_TOKEN if api_token is None else api_token
        self.base_url = (base_url or settings.RESPOND_IO_API_BASE_URL).rstrip("/")
        self.timeout = timeout

    def _ensure_authenticated(self) -> None:
        if not self.api_token or not str(self.api_token).strip():
            raise RespondIoAPIError(
                "RESPOND_IO_API_TOKEN is missing or unconfigured. Please configure it in .env.",
                status_code=401,
            )

    def _sanitize_error_message(self, err_str: str) -> str:
        if self.api_token and len(self.api_token) > 0:
            return err_str.replace(self.api_token, "[REDACTED_TOKEN]")
        return err_str

    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        self._ensure_authenticated()

        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params,
                    json=json_data,
                )
        except httpx.TimeoutException:
            raise RespondIoAPIError("Respond.io API request timed out", status_code=504)
        except httpx.RequestError as exc:
            raise RespondIoAPIError(
                f"Respond.io connection error: {type(exc).__name__}",
                status_code=502,
            )

        if response.is_error:
            status_code = response.status_code
            try:
                err_json = response.json()
                err_detail = err_json.get("message") or err_json.get("error", response.text)
            except Exception:
                err_detail = f"HTTP {status_code}"

            sanitized_msg = self._sanitize_error_message(str(err_detail))

            if status_code == 429:
                retry_after = response.headers.get("Retry-After")
                msg = f"Respond.io rate limit exceeded (429). {sanitized_msg}"
                if retry_after:
                    msg += f" Retry after {retry_after}s."
                raise RespondIoAPIError(msg, status_code=429)

            raise RespondIoAPIError(
                f"Respond.io API Error ({status_code}): {sanitized_msg}",
                status_code=status_code,
            )

        try:
            return response.json()
        except Exception:
            raise RespondIoAPIError("Failed to parse Respond.io API response JSON", status_code=500)

    async def get_workspace_info(self) -> dict[str, Any]:
        """Verify Respond.io credentials using a lightweight authenticated API request."""
        self._ensure_authenticated()
        url = f"{self.base_url}/contact/id:auth_check"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, headers=headers)
        except httpx.TimeoutException:
            raise RespondIoAPIError("Respond.io API request timed out", status_code=504)
        except httpx.RequestError as exc:
            raise RespondIoAPIError(
                f"Respond.io connection error: {type(exc).__name__}",
                status_code=502,
            )

        if response.status_code == 401:
            err_msg = "Respond.io authentication failed (401 Unauthorized)."
            try:
                err_json = response.json()
                err_detail = err_json.get("message", err_msg)
            except Exception:
                err_detail = err_msg
            raise RespondIoAPIError(
                self._sanitize_error_message(str(err_detail)), status_code=401
            )

        if response.status_code in (200, 400):
            return {
                "status": "authenticated",
                "valid": True,
                "provider": "respond_io",
            }

        raise RespondIoAPIError(
            f"Respond.io API Error ({response.status_code}): {response.text}",
            status_code=response.status_code,
        )

    async def list_contacts(
        self,
        search: str = "",
        timezone: str = "UTC",
    ) -> dict[str, Any]:
        """Fetch list of Contacts from Respond.io API using POST /contact/list."""
        payload = {
            "filter": {
                "$and": []
            },
            "search": search,
            "timezone": timezone,
        }
        return await self._request("POST", "/contact/list", json_data=payload)

    async def get_contact(self, contact_id: str) -> dict[str, Any]:
        """Retrieve Contact detail by contact_id or phone/email identifier."""
        if not contact_id or not str(contact_id).strip():
            raise RespondIoAPIError("contact_id is required.", status_code=400)
        return await self._request("POST", f"/contact/id:{contact_id}")

    async def send_message(
        self,
        contact_id: str,
        text: str,
    ) -> dict[str, Any]:
        """Send outbound text message to a Respond.io Contact via POST /contact/id:{contact_id}/message."""
        if not contact_id or not str(contact_id).strip():
            raise RespondIoAPIError("contact_id is required for sending messages.", status_code=400)

        if not text or not str(text).strip():
            raise RespondIoAPIError("Message text cannot be empty or whitespace only.", status_code=400)

        payload = {
            "message": {
                "type": "text",
                "text": text,
            }
        }

        return await self._request("POST", f"/contact/id:{contact_id}/message", json_data=payload)
