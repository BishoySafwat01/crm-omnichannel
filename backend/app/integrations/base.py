from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseMessagingProvider(ABC):
    """Abstract Base Class for Omnichannel Messaging Providers (Meta, BeOn, etc.)."""

    @abstractmethod
    async def send_outbound_message(
        self, recipient_id: str, text: str, **kwargs: Any
    ) -> dict[str, Any]:
        """Send an outbound text message to a customer recipient."""
        pass

    @abstractmethod
    async def send_outbound_attachment(
        self,
        recipient_id: str,
        file_path: str,
        attachment_type: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Send an outbound binary or media attachment (image, audio, video, file)."""
        pass

    @abstractmethod
    def normalize_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Normalize an incoming webhook payload into a canonical CRM event dictionary."""
        pass

    @abstractmethod
    async def validate_credentials(self) -> dict[str, Any]:
        """Validate API credentials and return account/connectivity details."""
        pass

    @abstractmethod
    async def sync_conversations(
        self, limit: int = 50, page: int = 1, **kwargs: Any
    ) -> dict[str, Any]:
        """Synchronize/fetch conversations from the external provider."""
        pass
