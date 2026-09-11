import asyncio
import httpx
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.message import Message

async def test():
    async with AsyncSessionLocal() as db:
        stmt = select(Message).order_by(Message.created_at.desc()).limit(15)
        msgs = (await db.execute(stmt)).scalars().all()
        
        media_msgs = [m for m in msgs if m.media_url]

        if not media_msgs:
            print("❌ No messages with media_url found in DB!")
            return

        for m in media_msgs[:5]:
            print(f"\nTesting message ID: {m.id} | Sender: {m.sender_type}")
            print(f"Media URL: {m.media_url}")
            
            target_url = m.media_url
            if target_url.startswith('/'):
                target_url = f"http://localhost:8000{target_url}"
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            }
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                res = await client.get(target_url, headers=headers)
                print(f"Fetch Status: {res.status_code} | Content-Type: {res.headers.get('content-type')} | Size: {len(res.content)} bytes")
                assert res.status_code == 200, f"Expected 200, got {res.status_code}"
                assert len(res.content) > 100, "Media size too small"

        print("\n✅ LIVE MEDIA FETCH VERIFICATION: ALL IMAGES/MEDIA DOWNLOADED WITH HTTP 200 OK!")

if __name__ == "__main__":
    asyncio.run(test())
