from typing import Any, Optional

from app.integrations.respond_io.client import RespondIoClient
from app.integrations.respond_io.normalizer import (
    NormalizedRespondIoContact,
    NormalizedRespondIoWebhookEvent,
    RespondIoNormalizer,
)


class RespondIoProvider:
    def __init__(self, client: Optional[RespondIoClient] = None):
        self.client = client or RespondIoClient()

    async def validate_configuration(self) -> dict[str, Any]:
        res = await self.client.get_workspace_info()
        return {
            "valid": True,
            "provider": "respond_io",
            "raw": res,
        }

    async def get_all_contacts(self) -> list[NormalizedRespondIoContact]:
        res = await self.client.list_contacts()
        items = res.get("items", [])
        normalized = []
        for raw_c in items:
            norm = RespondIoNormalizer.normalize_contact(raw_c)
            normalized.append(norm)
        return normalized

    def parse_webhook_event(self, raw_payload: dict[str, Any]) -> NormalizedRespondIoWebhookEvent:
        return RespondIoNormalizer.normalize_webhook_event(raw_payload)

    async def send_outbound_message(
        self,
        recipient_external_id: str,
        text: str,
    ) -> dict[str, Any]:
        res = await self.client.send_message(
            contact_id=recipient_external_id,
            text=text,
        )
        raw_id = res.get("messageId") or res.get("id") or "res_msg_success"
        return {
            "external_message_id": str(raw_id),
            "recipient_id": str(recipient_external_id),
            "raw": res,
        }
