import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import httpx

logger = logging.getLogger("app.integrations.meta.rate_limit")


class MetaRateLimitGuard:
    """
    Centralized rate limit detection, usage throttling, and circuit breaker for Meta Graph API.
    Prevents API quota exhaustion (OAuthException #4 / #17 / #32 / #613 / 429)
    by enforcing exponential backoff and cooldown periods.
    """

    _cooldown_until: Optional[datetime] = None
    _consecutive_rate_limits: int = 0
    _failed_psids_cache: dict[str, datetime] = {}

    @classmethod
    def is_rate_limited(cls) -> bool:
        """Check if Meta Graph API is currently in a rate-limit cooldown period."""
        if cls._cooldown_until is None:
            return False
        now = datetime.now(timezone.utc)
        if now < cls._cooldown_until:
            return True
        # Cooldown expired, reset
        cls._cooldown_until = None
        return False

    @classmethod
    def get_cooldown_remaining(cls) -> float:
        """Returns the remaining cooldown duration in seconds."""
        if cls._cooldown_until is None:
            return 0.0
        now = datetime.now(timezone.utc)
        remaining = (cls._cooldown_until - now).total_seconds()
        return max(0.0, remaining)

    @classmethod
    def trigger_cooldown(cls, reason: str, cooldown_seconds: Optional[int] = None) -> None:
        """Activate rate-limit cooldown with exponential backoff."""
        cls._consecutive_rate_limits += 1
        base_seconds = cooldown_seconds or 300  # Default 5 minutes
        # Exponential backoff: 5m, 10m, 20m, 30m (capped at 60m)
        multiplier = min(12, 2 ** (cls._consecutive_rate_limits - 1))
        effective_seconds = min(3600, base_seconds * multiplier)

        cls._cooldown_until = datetime.now(timezone.utc) + timedelta(seconds=effective_seconds)
        logger.warning(
            "[MetaRateLimitGuard] 🛑 Meta API Rate Limit Activated: %s. "
            "Enforcing cooldown of %d seconds (until %s UTC). Consecutive hits: %d",
            reason,
            effective_seconds,
            cls._cooldown_until.isoformat(),
            cls._consecutive_rate_limits,
        )

    @classmethod
    def reset_cooldown(cls) -> None:
        """Reset rate-limit state when calls succeed normally."""
        cls._cooldown_until = None
        cls._consecutive_rate_limits = 0

    @classmethod
    def inspect_response(cls, response: httpx.Response) -> None:
        """Inspect HTTP response status, error payloads, and Meta usage headers."""
        # 1. Check HTTP Status Code 429
        if response.status_code == 429:
            cls.trigger_cooldown(
                reason=f"HTTP 429 Too Many Requests ({response.text[:200]})",
                cooldown_seconds=600,
            )
            return

        # 2. Check JSON Error body for Meta Rate Limit error codes
        if response.is_error:
            try:
                err_data = response.json().get("error", {})
                code = err_data.get("code")
                subcode = err_data.get("error_subcode")
                msg = str(err_data.get("message", "")).lower()

                # Meta Error Codes for Rate Limiting:
                # 4: Application request limit reached
                # 17: User request limit reached
                # 32: Page request limit reached
                # 613: Custom-level rate limit reached
                if (
                    code in (4, 17, 32, 613)
                    or "request limit reached" in msg
                    or "rate limit" in msg
                    or "too many requests" in msg
                ):
                    cls.trigger_cooldown(
                        reason=f"Meta Error #{code} (Subcode {subcode}): {err_data.get('message')}",
                        cooldown_seconds=900,  # 15 minutes
                    )
                    return
            except Exception:
                pass

        # 3. Check Meta Rate Limit Usage Headers (x-page-usage, x-app-usage, x-business-use-case-usage)
        usage_hdr = (
            response.headers.get("x-page-usage")
            or response.headers.get("x-app-usage")
            or response.headers.get("x-business-use-case-usage")
        )
        if usage_hdr:
            try:
                usage = json.loads(usage_hdr)
                if isinstance(usage, dict):
                    call_count = usage.get("call_count", 0)
                    total_cputime = usage.get("total_cputime", 0)
                    total_time = usage.get("total_time", 0)
                    max_pct = max(call_count, total_cputime, total_time)

                    if max_pct >= 95:
                        cls.trigger_cooldown(
                            reason=f"Meta usage header threshold exceeded ({max_pct}% >= 95% in {usage_hdr})",
                            cooldown_seconds=300,
                        )
                    elif max_pct >= 80:
                        logger.warning("[MetaRateLimitGuard] ⚠️ High Meta API Usage: %s", usage_hdr)
            except Exception:
                pass

    @classmethod
    def is_psid_failed_recently(cls, psid: str) -> bool:
        """Check if a PSID failed profile lookup recently (Negative Caching)."""
        expiry = cls._failed_psids_cache.get(psid)
        if expiry and datetime.now(timezone.utc) < expiry:
            return True
        if expiry:
            cls._failed_psids_cache.pop(psid, None)
        return False

    @classmethod
    def record_failed_psid(cls, psid: str, ttl_seconds: int = 3600) -> None:
        """Cache failed/unresolvable PSID to prevent repetitive API calls."""
        # Keep cache bounded to prevent memory growth
        if len(cls._failed_psids_cache) > 5000:
            cls._failed_psids_cache.clear()
        cls._failed_psids_cache[psid] = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
