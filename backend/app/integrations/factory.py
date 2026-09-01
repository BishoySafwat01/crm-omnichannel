import logging
from typing import Optional, Union

from app.core.config import settings
from app.integrations.base import BaseMessagingProvider
from app.integrations.beon.provider import BeonOmnichannelProvider
from app.integrations.meta.provider import MetaProvider
from app.models.enums import ChannelEnum, ProviderEnum

logger = logging.getLogger("app.integrations.factory")


class ProviderFactory:
    """Dynamic Provider Factory with Hybrid Meta / BeOn Omnichannel Routing."""

    @classmethod
    def get_provider(
        cls,
        provider_name: Optional[Union[ProviderEnum, str]] = None,
        channel: Optional[Union[ChannelEnum, str]] = None,
        page_id: Optional[str] = None,
    ) -> BaseMessagingProvider:
        """Resolve and instantiate the appropriate messaging provider.

        Switching Rules:
        1. If settings.ENABLE_DIRECT_META is False:
           -> ALL messaging routes via BeonOmnichannelProvider.
        2. If settings.ENABLE_DIRECT_META is True:
           -> Facebook Messenger routes via MetaProvider (Direct Graph API v23.0).
           -> Other channels (WhatsApp, SMS, Instagram, TikTok) route via BeonOmnichannelProvider.
        """
        # Global switch check
        if not getattr(settings, "ENABLE_DIRECT_META", False):
            logger.debug("Direct Meta disabled; routing via BeOn Omnichannel Provider.")
            return BeonOmnichannelProvider()

        # Hybrid mode: Direct Meta is enabled
        channel_str = str(channel.value if isinstance(channel, ChannelEnum) else channel or "").lower().strip()
        provider_str = str(provider_name.value if isinstance(provider_name, ProviderEnum) else provider_name or "").lower().strip()

        is_meta_channel = channel_str in ("messenger", "facebook") or provider_str in ("meta",)

        if is_meta_channel:
            logger.debug(f"Routing to Direct MetaProvider (page_id={page_id})")
            return MetaProvider(page_id=page_id)

        logger.debug(f"Routing channel '{channel_str}' to BeonOmnichannelProvider")
        return BeonOmnichannelProvider()
