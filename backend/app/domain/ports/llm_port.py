from typing import Any, Dict, Protocol


class LLMProviderPort(Protocol):
    """
    Domain Port defining the contract for LLM providers.
    Decouples business services from external LLM vendor clients.

    Domain services (such as AIService) operate statelessly and consume this port
    via method dependency injection (e.g. analyze_conversation(..., llm_provider=...)),
    allowing clean test mocking, provider swapping, and zero mutable state.
    """

    async def analyze_conversation(
        self, transcript: str, brand_name: str, **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze a conversation transcript for intent, sentiment, summary, and suggested replies.
        """
        ...
