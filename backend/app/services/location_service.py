import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.enums import SenderTypeEnum
from app.core.country_detector import CountryDetector

logger = logging.getLogger(__name__)


class LocationService:
    @classmethod
    async def evaluate_conversation_location(cls, session: AsyncSession, conversation_id: str) -> Optional[str]:
        """
        Inspects recent customer and system greeting messages to assign location.
        CRITICAL BUSINESS RULES:
        1. Never downgrade an existing valid location to 'غير ذلك'.
        2. Inspect inbound customer messages and ad greetings; ignore agent questions.
        """
        conv = await session.get(Conversation, conversation_id)
        if not conv or not conv.customer_id:
            return None

        cust = await session.get(Customer, conv.customer_id)
        current_loc = cust.location if cust else None

        # Fetch last 5 messages in thread
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(5)
        )
        msgs = (await session.execute(stmt)).scalars().all()

        detected = None
        for m in msgs:
            # Skip agent messages to avoid agent questions triggering customer location updates
            if m.sender_type == SenderTypeEnum.AGENT:
                continue

            if m.text:
                candidate = CountryDetector.extract_country(m.text)
                if candidate and candidate != "غير ذلك":
                    detected = candidate
                    break

        # Decision matrix
        if detected:
            if current_loc != detected and cust:
                cust.location = detected
                session.add(cust)
                await session.commit()
                logger.info(f"[Location Sync] Conv {conversation_id} -> Updated customer {conv.customer_id} to {detected}")
            return detected

        # If no country detected in recent messages, PRESERVE current location (do not downgrade to 'غير ذلك')
        return current_loc or "غير ذلك"
