"""
Wave 3 Reliability & Operational Smoke Test Suite
Verifies:
1. Team hierarchy and role distribution (/api/v1/admin/team/members)
2. Unified inbox search and pagination (/api/v1/conversations)
3. Real-time WebSocket handshake and ping-pong loop (/api/v1/ws/chat)
"""

import asyncio
import json
import httpx
import websockets

BASE_HTTP_URL = "http://127.0.0.1:8001"
BASE_WS_URL = "ws://127.0.0.1:8001"


async def main():
    print("==================================================")
    print("🚀 Starting Wave 3 Operational Smoke Test Suite")
    print("==================================================")

    # 1. Health Probe
    async with httpx.AsyncClient(base_url=BASE_HTTP_URL, timeout=10.0) as client:
        h = await client.get("/health")
        print(f"\n[1] Health Probe: HTTP {h.status_code} -> {h.json()}")
        assert h.status_code == 200

        # 2. Authenticate
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "bishoysafwat@luxira.com", "password": "admin123456"},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        auth_data = login_res.json()
        token = auth_data["access_token"]
        user = auth_data["user"]
        print(f"\n[2] Authentication: Logged in as {user['email']} (Name: {user['full_name']}, Role: {user['role']})")
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Team Hierarchy & Roles Check
        team_res = await client.get("/api/v1/admin/team/members", headers=headers)
        assert team_res.status_code == 200, f"Team members failed: {team_res.text}"
        members = team_res.json()
        print(f"\n[3] Team Hierarchy Check: {len(members)} total members registered")
        for m in members:
            print(f"  - {m['email']:<28} | Name: {m['full_name']:<24} | Role: {m['role']:<10} | Active: {m['is_active']}")
        assert len(members) >= 4, f"Expected at least 4 team members, got {len(members)}"

        # 4. Conversations Pagination & Search Probe
        conv_res = await client.get("/api/v1/conversations?page=1&page_size=20", headers=headers)
        assert conv_res.status_code == 200
        conv_data = conv_res.json()
        print(f"\n[4] Inbox Pagination Probe:")
        print(f"  Total Conversations: {conv_data.get('total')}")
        print(f"  Items in Page 1:     {len(conv_data.get('items', []))}")

        search_term = "Samira"
        search_res = await client.get(f"/api/v1/conversations?search={search_term}", headers=headers)
        assert search_res.status_code == 200
        search_data = search_res.json()
        print(f"\n[5] Inbox Search Probe (?search={search_term}):")
        print(f"  Matches Found: {search_data.get('total')}")
        for item in search_data.get("items", []):
            print(f"  - Customer: {item.get('customer_display_name')} | Brand: {item.get('brand')} | Unread: {item.get('unread_count')}")

    # 5. Real-Time WebSocket Handshake Probe
    ws_url = f"{BASE_WS_URL}/api/v1/ws/chat?token={token}"
    print(f"\n[6] Real-Time WebSocket Probe:")
    print(f"  Connecting to: {ws_url[:45]}...")
    async with websockets.connect(ws_url) as ws:
        print("  ✅ WebSocket Handshake 101 Switching Protocols ACCEPTED")
        
        # Ping frame
        ping_payload = {"type": "PING"}
        await ws.send(json.dumps(ping_payload))
        resp_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        resp = json.loads(resp_raw)
        print(f"  Received: {resp}")
        assert resp.get("type") == "PONG", f"Expected PONG, got {resp}"
        print("  ✅ Heartbeat PING -> PONG successful!")

    print("\n==================================================")
    print("✨ ALL WAVE 3 OPERATIONS VALIDATED SUCCESSFULLY")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
