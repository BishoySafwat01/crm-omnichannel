import asyncio
import json
import uuid
import httpx
from datetime import datetime, timezone
from sqlalchemy import select, text
from app.main import app
from app.core.database import AsyncSessionLocal
from app.core.security import create_access_token, get_password_hash
from app.models.user import User
from app.models.conversation import Conversation
from app.models.customer import Customer
from app.models.enums import UserRole, ChannelEnum, ProviderEnum, ConversationStatusEnum
from app.models.audit import UserAuditLog

BASE_URL = "http://testserver/api/v1"

async def main():
    print("=== STARTING AUTHORIZED CHANNELS SYSTEM E2E VERIFICATION ===")
    
    async with AsyncSessionLocal() as session:
        # 1. Ensure Superadmin
        admin_stmt = select(User).where(User.email == "admin@luxira.com")
        res = await session.execute(admin_stmt)
        admin = res.scalar_one_or_none()
        if not admin:
            admin = User(
                email="admin@luxira.com",
                password_hash=get_password_hash("Admin123!"),
                full_name="Luxira Superadmin",
                role=UserRole.ADMIN,
                brand_access=["ALL"],
                channel_access=["ALL"],
                is_active=True,
            )
            session.add(admin)
            await session.commit()
            await session.refresh(admin)

        admin_token = create_access_token(admin.id)
        admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

        # 2. Ensure Test Customer & Test Conversations across different Brands and Channels
        cust_stmt = select(Customer).limit(1)
        cust_res = await session.execute(cust_stmt)
        cust = cust_res.scalar_one_or_none()
        if not cust:
            cust = Customer(
                display_name="Test Customer Channels",
                email="test_channels@example.com",
                phone="+966500000000",
                country="السعودية",
                brand="LUXIRA",
            )
            session.add(cust)
            await session.commit()
            await session.refresh(cust)

        async def get_or_create_conv(brand: str, channel: ChannelEnum, ext_id: str):
            st = select(Conversation).where(Conversation.external_conversation_id == ext_id)
            r = await session.execute(st)
            c = r.scalar_one_or_none()
            if not c:
                c = Conversation(
                    customer_id=cust.id,
                    provider=ProviderEnum.META if channel in [ChannelEnum.MESSENGER, ChannelEnum.INSTAGRAM] else ProviderEnum.BEON,
                    channel=channel,
                    external_conversation_id=ext_id,
                    subject=f"Thread {brand} {channel.value}",
                    brand=brand,
                    status=ConversationStatusEnum.OPEN,
                )
                session.add(c)
                await session.commit()
                await session.refresh(c)
            return c

        conv_luxira_msgr = await get_or_create_conv("LUXIRA", ChannelEnum.MESSENGER, "test_conv_luxira_msgr_001")
        conv_luxira_ig = await get_or_create_conv("LUXIRA", ChannelEnum.INSTAGRAM, "test_conv_luxira_ig_001")
        conv_lavva_msgr = await get_or_create_conv("LAVVA", ChannelEnum.MESSENGER, "test_conv_lavva_msgr_001")
        conv_lavva_wa = await get_or_create_conv("LAVVA", ChannelEnum.WHATSAPP, "test_conv_lavva_wa_001")

        print("Test Conversations ready:")
        print(f" - LUXIRA Messenger: {conv_luxira_msgr.id}")
        print(f" - LUXIRA Instagram: {conv_luxira_ig.id}")
        print(f" - LAVVA Messenger: {conv_lavva_msgr.id}")
        print(f" - LAVVA WhatsApp: {conv_lavva_wa.id}")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE_URL, timeout=30.0) as client:
        # TEST 1: Available Channels API
        print("\n--- TEST 1: GET /admin/team/channels ---")
        ch_res = await client.get("/admin/team/channels", headers=admin_headers)
        assert ch_res.status_code == 200, f"Expected 200, got {ch_res.status_code}: {ch_res.text}"
        channels_list = ch_res.json()
        print(f"Returned supported channels: {channels_list}")
        assert "messenger" in channels_list
        assert "instagram" in channels_list
        assert "whatsapp" in channels_list
        assert "tiktok" in channels_list
        print("[PASS] Supported channels endpoint verified.")

        # TEST 2: Create Team Member with channel_access via API
        print("\n--- TEST 2: POST /admin/team/members with channel_access ---")
        agent_email = f"agent_msgr_{uuid.uuid4().hex[:6]}@luxira.com"
        create_payload = {
            "email": agent_email,
            "password": "Password123!",
            "full_name": "Messenger Specialist Agent",
            "role": "agent",
            "brand_access": ["LUXIRA"],
            "channel_access": ["messenger"],
            "is_active": True,
        }
        create_res = await client.post("/admin/team/members", json=create_payload, headers=admin_headers)
        assert create_res.status_code == 201, f"Failed to create user: {create_res.text}"
        created_user = create_res.json()
        print(f"Created Agent: {created_user['email']} (ID: {created_user['id']})")
        print(f" - Brand Access: {created_user['brand_access']}")
        print(f" - Channel Access: {created_user['channel_access']}")
        assert created_user["channel_access"] == ["messenger"]
        assert created_user["brand_access"] == ["LUXIRA"]

        agent_token = create_access_token(created_user["id"])
        agent_headers = {"Authorization": f"Bearer {agent_token}", "Content-Type": "application/json"}
        print("[PASS] User creation with channel_access verified.")

        # TEST 3: Scoped Conversation Listing for Agent
        print("\n--- TEST 3: Scoped GET /conversations query ---")
        list_res = await client.get("/conversations", headers=agent_headers)
        assert list_res.status_code == 200, f"Failed to list: {list_res.text}"
        items = list_res.json().get("items", [])
        print(f"Agent visible conversations count: {len(items)}")
        for it in items:
            print(f"  Visible: Brand={it.get('brand')} | Channel={it.get('channel')}")
            assert it.get("brand", "").upper() == "LUXIRA", f"Unexpected brand in agent listing: {it.get('brand')}"
            assert it.get("channel", "").lower() == "messenger", f"Unexpected channel in agent listing: {it.get('channel')}"
        print("[PASS] Database scoping strictly filtered to Brand=LUXIRA AND Channel=messenger.")

        # TEST 4: Authorization Enforcement on Conversation Detail & Messages
        print("\n--- TEST 4: Conversation Access Authorization (403 Enforcement) ---")
        # 4a. Agent accesses LUXIRA Messenger -> MUST SUCCEED (200)
        r_ok = await client.get(f"/conversations/{conv_luxira_msgr.id}", headers=agent_headers)
        assert r_ok.status_code == 200, f"Expected 200 for LUXIRA Messenger, got {r_ok.status_code}"
        print(" -> LUXIRA Messenger detail: 200 OK (Allowed)")

        # 4b. Agent accesses LUXIRA Instagram -> MUST BE FORBIDDEN (403)
        r_denied_channel = await client.get(f"/conversations/{conv_luxira_ig.id}", headers=agent_headers)
        assert r_denied_channel.status_code == 403, f"Expected 403 for unauthorized channel, got {r_denied_channel.status_code}"
        print(" -> LUXIRA Instagram detail: 403 Forbidden (Channel Unauthorized)")

        # 4c. Agent accesses LAVVA Messenger -> MUST BE FORBIDDEN (403)
        r_denied_brand = await client.get(f"/conversations/{conv_lavva_msgr.id}", headers=agent_headers)
        assert r_denied_brand.status_code == 403, f"Expected 403 for unauthorized brand, got {r_denied_brand.status_code}"
        print(" -> LAVVA Messenger detail: 403 Forbidden (Brand Unauthorized)")

        # 4d. Agent accesses LAVVA WhatsApp -> MUST BE FORBIDDEN (403)
        r_denied_both = await client.get(f"/conversations/{conv_lavva_wa.id}", headers=agent_headers)
        assert r_denied_both.status_code == 403, f"Expected 403 for unauthorized brand & channel, got {r_denied_both.status_code}"
        print(" -> LAVVA WhatsApp detail: 403 Forbidden (Both Unauthorized)")

        # 4e. Agent message listing check
        r_msg_denied = await client.get(f"/conversations/{conv_luxira_ig.id}/messages", headers=agent_headers)
        assert r_msg_denied.status_code == 403, f"Expected 403 for unauthorized messages, got {r_msg_denied.status_code}"
        print(" -> LUXIRA Instagram messages list: 403 Forbidden")

        # TEST 5: Outbound Send Message Authorization Check
        print("\n--- TEST 5: Outbound Reply Authorization Check ---")
        reply_payload = {"text": "Test unauthorized reply"}
        r_send_denied = await client.post(f"/conversations/{conv_luxira_ig.id}/messages", json=reply_payload, headers=agent_headers)
        assert r_send_denied.status_code == 403, f"Expected 403 on outbound reply to unauthorized channel, got {r_send_denied.status_code}"
        print(" -> Outbound reply to LUXIRA Instagram: 403 Forbidden (Blocked before dispatch)")

        r_send_brand_denied = await client.post(f"/conversations/{conv_lavva_msgr.id}/messages", json=reply_payload, headers=agent_headers)
        assert r_send_brand_denied.status_code == 403, f"Expected 403 on outbound reply to unauthorized brand, got {r_send_brand_denied.status_code}"
        print(" -> Outbound reply to LAVVA Messenger: 403 Forbidden (Blocked before dispatch)")

        # TEST 6: Update Member channel_access & Audit Log Verification
        print("\n--- TEST 6: PATCH /admin/team/members/{id} updating channel_access ---")
        patch_payload = {
            "channel_access": ["messenger", "instagram"],
        }
        patch_res = await client.patch(f"/admin/team/members/{created_user['id']}", json=patch_payload, headers=admin_headers)
        assert patch_res.status_code == 200, f"Failed to patch user: {patch_res.text}"
        patched_user = patch_res.json()
        print(f"Updated Channel Access: {patched_user['channel_access']}")
        assert set(patched_user["channel_access"]) == {"messenger", "instagram"}

        # Now agent CAN access LUXIRA Instagram!
        r_now_allowed = await client.get(f"/conversations/{conv_luxira_ig.id}", headers=agent_headers)
        assert r_now_allowed.status_code == 200, f"Expected 200 after granting instagram access, got {r_now_allowed.status_code}"
        print(" -> LUXIRA Instagram detail after update: 200 OK (Access successfully granted)")

        # Verify Audit Log entry for user.updated
        print("\n--- TEST 7: Audit Logging for Channel Access Changes ---")
        audit_res = await client.get(f"/admin/team/audit-logs?user_id={admin.id}&action=user.updated", headers=admin_headers)
        assert audit_res.status_code == 200, f"Failed to get audit logs: {audit_res.text}"
        logs = audit_res.json().get("items", [])
        assert len(logs) > 0, "No audit logs found for user.updated"
        latest_log = logs[0]
        print(f"Audit log payload: {latest_log.get('payload')}")
        changes = latest_log.get("payload", {}).get("changes", {})
        assert "channel_access" in changes, "channel_access change not recorded in audit log"
        print(f"Recorded channel_access diff: {changes['channel_access']}")
        print("[PASS] Channel access update and audit logging fully verified.")

        # TEST 8: Superadmin Unrestricted Access
        print("\n--- TEST 8: Superadmin Unrestricted Access ---")
        admin_msgr = await client.get(f"/conversations/{conv_lavva_msgr.id}", headers=admin_headers)
        admin_wa = await client.get(f"/conversations/{conv_lavva_wa.id}", headers=admin_headers)
        admin_ig = await client.get(f"/conversations/{conv_luxira_ig.id}", headers=admin_headers)
        assert admin_msgr.status_code == 200
        assert admin_wa.status_code == 200
        assert admin_ig.status_code == 200
        print(" -> Superadmin (ALL) has full unrestricted access to all brands and channels (200 OK)")

    print("\n=== ALL 8 AUTHORIZED CHANNELS TEST SUITES PASSED PERFECTLY ===")

if __name__ == "__main__":
    asyncio.run(main())
