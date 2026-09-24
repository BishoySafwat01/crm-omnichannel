import logging
from typing import Optional, Union

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.integrations.base import BaseMessagingProvider
from app.integrations.beon.provider import BeonOmnichannelProvider
from app.integrations.meta.provider import MetaProvider
from app.models.enums import ChannelEnum, ProviderEnum

logger = logging.getLogger("app.integrations.factory")


class ProviderFactory:
    """Dynamic Provider Factory - Pure Meta Direct Mode."""

    @classmethod
    def get_provider(
        cls,
        provider_name: Optional[Union[ProviderEnum, str]] = None,
        channel: Optional[Union[ChannelEnum, str]] = None,
        page_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> BaseMessagingProvider:
        """Resolve and instantiate the appropriate messaging provider.

        In pure Meta Direct mode:
        -> All messaging routes via MetaProvider (Direct Graph API).
        -> Conversations marked as BEON or HYBRID_META_BEON automatically route
           to MetaProvider without attempting to contact external BeOn servers.
        """
        logger.debug(
            "[ProviderFactory] Routing provider='%s', channel='%s' to MetaProvider (page_id=%s)",
            provider_name,
            channel,
            page_id,
        )
        return MetaProvider(page_id=page_id, db=db, channel=channel or ChannelEnum.MESSENGER)

