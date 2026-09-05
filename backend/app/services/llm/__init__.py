"""
LLM Subsystem Package for Luxira Omnichannel CRM AI Copilot Engine.
Provides 3-Tier Resilient Cascading AI Analysis (Tier 1 -> Tier 2 -> Tier 3 Local Fallback).
"""

from app.services.llm.groq_client import analyze_with_groq_cascade
from app.services.llm.fallback_engine import analyze_fallback
from app.services.llm.prompts import COPILOT_SYSTEM_PROMPT

__all__ = ["analyze_with_groq_cascade", "analyze_fallback", "COPILOT_SYSTEM_PROMPT"]
