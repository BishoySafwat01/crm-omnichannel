import asyncio
import httpx
from app.core.config import settings


async def subscribe_page():
    page_id = settings.META_PAGE_ID or "1302055352987458"
    token = settings.META_PAGE_ACCESS_TOKEN
    version = getattr(settings, "META_API_VERSION", "v23.0") or "v23.0"

    url = f"https://graph.facebook.com/{version}/{page_id}/subscribed_apps"
    params = {
        "subscribed_fields": "messages,messaging_postbacks,message_deliveries,message_reads",
        "access_token": token,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, params=params)
            print(f"[Meta Subscription] Status: {res.status_code}, Response: {res.text}")
            if res.status_code == 200 and res.json().get("success"):
                print("Successfully subscribed Facebook Page to App Webhooks.")
            else:
                print("Failed to subscribe page. Check Page Access Token permissions.")
    except Exception as e:
        print(f"[Meta Subscription] Exception: {e}")


if __name__ == "__main__":
    asyncio.run(subscribe_page())
