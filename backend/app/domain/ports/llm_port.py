from typing import Any, Dict, Protocol


class LLMProviderPort(Protocol):
    """
    Domain Port defining the contract for LLM providers.
    Decouples business services from external LLM vendor clients.
    """

    async def analyze_conversation(
        self, transcript: str, brand_name: str, **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze a conversation transcript for intent, sentiment, summary, and suggested replies.
        """
        ...
