import logging
from typing import Any, Dict, List, Optional

from app.domain.ports.llm_port import LLMProviderPort
from app.services.llm.groq_client import analyze_with_groq_cascade

logger = logging.getLogger(__name__)


class GroqAdapter:
    """
    Infrastructure Adapter implementing LLMProviderPort using Groq Cloud API
    with 3-Tier Resilient Cascading Analysis.
    """

    async def analyze_conversation(
        self, transcript: str, brand_name: str, **kwargs
    ) -> Dict[str, Any]:
        """
        Adapts the LLMProviderPort interface to invoke the Groq cascade client.

        Args:
            transcript (str): Serialized conversation transcript string.
            brand_name (str): Tenant/brand identifier for context.
            **kwargs:
                messages (List[Dict[str, str]], optional): Structured message list
                    with schema [{"sender": str, "text": str}, ...]. Universally
                    supplied by AIService.analyze_conversation.

        Returns:
            Dict[str, Any]: Dict containing summary, intent, sentiment, and suggested replies.
        """
        messages: Optional[List[Dict[str, str]]] = kwargs.get("messages")

        # In standard CRM operation, AIService universally supplies structured messages.
        # If omitted by an external caller, gracefully fallback to single-turn transcript payload.
        if messages is None:
            messages = (
                [{"sender": "customer", "text": transcript.strip()}]
                if transcript and transcript.strip()
                else []
            )

        return await analyze_with_groq_cascade(messages=messages, brand_name=brand_name)
