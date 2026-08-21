"""
Groq Cloud Async API Client with 3-Tier Resilient Cascading Analysis.
Tier 1: openai/gpt-oss-120b
Tier 2: openai/gpt-oss-20b
Tier 3: Local Offline Rule-Based NLP Engine
"""

import json
import logging
from typing import Any, Dict, List
import httpx

from app.core.config import settings
from app.services.llm.fallback_engine import analyze_fallback
from app.services.llm.prompts import COPILOT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


async def analyze_with_groq_cascade(
    messages: List[Dict[str, str]],
    brand_name: str,
) -> Dict[str, Any]:
    """
    Executes 3-Tier Cascading AI Analysis:
    Tier 1: openai/gpt-oss-120b
    Tier 2: openai/gpt-oss-20b
    Tier 3: Local Heuristic NLP Engine
    """
    if not settings.GROQ_API_KEY:
        logger.warning("[Groq Cascade] No GROQ_API_KEY configured. Defaulting directly to Tier 3 Local Fallback Engine...")
        return analyze_fallback(messages, brand_name)

    user_payload = f"Active Brand Name: {brand_name}\n\nConversation Transcript:\n"
    if not messages:
        user_payload += "(No previous messages in conversation)\n"
    else:
        for msg in messages:
            sender = msg.get("sender", "customer")
            text = msg.get("text", "")
            user_payload += f"[{sender}]: {text}\n"

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    tiers = [
        ("Tier 1 (120B)", settings.GROQ_TIER1_MODEL),
        ("Tier 2 (20B)", settings.GROQ_TIER2_MODEL),
    ]

    async with httpx.AsyncClient(timeout=settings.GROQ_TIMEOUT_SECONDS) as client:
        for tier_name, model_id in tiers:
            try:
                logger.info(f"✨ [Groq Cascade] Invoking {tier_name} model: {model_id}")
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": model_id,
                        "messages": [
                            {"role": "system", "content": COPILOT_SYSTEM_PROMPT},
                            {"role": "user", "content": user_payload},
                        ],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.2,
                        "max_completion_tokens": 800,
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    content_str = data["choices"][0]["message"]["content"]
                    parsed_json = json.loads(content_str)
                    logger.info(f"✅ [Groq Cascade] {tier_name} analysis succeeded!")
                    return parsed_json
                else:
                    logger.warning(f"[Groq Cascade] {tier_name} returned status {response.status_code}: {response.text}")
            except Exception as exc:
                logger.warning(f"[Groq Cascade] {tier_name} invocation failed ({exc}). Failing over to next tier...")

    logger.warning("[Groq Cascade] All Groq LLM tiers exhausted. Executing Tier 3 (Local Offline Fallback)...")
    return analyze_fallback(messages, brand_name)
