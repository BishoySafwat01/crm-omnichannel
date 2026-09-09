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
        Extracts pre-formatted messages if supplied in kwargs or reconstructs from transcript.
        """
        messages: Optional[List[Dict[str, str]]] = kwargs.get("messages")

        if messages is None:
            messages = []
            if transcript:
                for line in transcript.strip().split("\n"):
                    line = line.strip()
                    if line.startswith("[") and "]:" in line:
                        parts = line[1:].split("]:", 1)
                        messages.append({
                            "sender": parts[0].strip(),
                            "text": parts[1].strip(),
                        })
                    elif line:
                        messages.append({
                            "sender": "customer",
                            "text": line,
                        })

        return await analyze_with_groq_cascade(messages=messages, brand_name=brand_name)
