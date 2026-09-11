import asyncio
import json
import logging
from typing import Any
import httpx
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("probe_meta_tokens")


async def probe_page(client: httpx.AsyncClient, page_id: str, page_info: dict[str, Any]) -> dict[str, Any]:
    token = page_info.get("access_token") or page_info.get("token") or ""
    name = page_info.get("name") or "Unknown"
    category = page_info.get("category") or ""
    url = f"https://graph.facebook.com/v23.0/{page_id}"
    params = {
        "fields": "id,name,category",
        "access_token": token,
    }

    result = {
        "page_id": page_id,
        "name": name,
        "category": category,
        "status_code": 0,
        "is_valid": False,
        "error_type": None,
        "error_code": None,
        "error_subcode": None,
        "error_message": None,
        "response_data": None,
    }

    try:
        resp = await client.get(url, params=params, timeout=15.0)
        result["status_code"] = resp.status_code
        data = resp.json()
        if resp.status_code == 200:
            result["is_valid"] = True
            result["response_data"] = data
            logger.info("✅ Page %s (%s) is VALID (HTTP 200) - Name: %s", page_id, name, data.get("name"))
        else:
            err = data.get("error") or {}
            result["error_type"] = err.get("type")
            result["error_code"] = err.get("code")
            result["error_subcode"] = err.get("error_subcode")
            result["error_message"] = err.get("message")
            logger.warning(
                "❌ Page %s (%s) FAILED (HTTP %d): Code=%s, Subcode=%s, Msg=%s",
                page_id,
                name,
                resp.status_code,
                result["error_code"],
                result["error_subcode"],
                result["error_message"],
            )
    except Exception as exc:
        result["status_code"] = -1
        result["error_message"] = str(exc)
        logger.error("⚠️ Page %s (%s) Exception: %s", page_id, name, exc)

    return result


async def main():
    pages = settings.get_meta_pages()
    print(f"Loaded {len(pages)} pages from META_PAGES_CONFIG.")
    results = []

    async with httpx.AsyncClient() as client:
        tasks = [probe_page(client, pid, pinfo) for pid, pinfo in pages.items()]
        results = await asyncio.gather(*tasks)

    print("\n" + "=" * 80)
    print("META PAGE TOKEN PROBE RESULTS SUMMARY")
    print("=" * 80)
    for r in results:
        status_icon = "✅ ACTIVE (200 OK)" if r["is_valid"] else f"❌ INVALID ({r['status_code']})"
        err_info = ""
        if not r["is_valid"]:
            err_info = f" | Err: code={r['error_code']}, subcode={r['error_subcode']}, msg={r['error_message']}"
        print(f"- Page {r['page_id']} ({r['name']}): {status_icon}{err_info}")

    # Output JSON summary for structured parsing
    with open("probe_results.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print("\nSaved detailed probe results to probe_results.json")


if __name__ == "__main__":
    asyncio.run(main())
