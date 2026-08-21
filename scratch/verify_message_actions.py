"""
Automated Verification Suite: Messenger-Style Message Actions System with Backend RBAC
Tests live running backend endpoints at http://127.0.0.1:8000
"""

import sys
import uuid
import asyncio
import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"

def print_step(title):
    print(f"\n======================================================\n[TEST STEP] {title}\n======================================================")

async def run_tests():
    async with httpx.AsyncClient(timeout=30.0) as client:
        print_step("1. Authenticate Superadmin and Create Test Users")
        # Login superadmin
        login_res = await client.post(f"{BASE_URL}/auth/login", json={"email": "admin@luxira.com", "password": "admin123456"})
        if login_res.status_code != 200:
            login_res = await client.post(f"{BASE_URL}/auth/login", json={"email": "admin@luxira.com", "password": "adminpassword123"})
        assert login_res.status_code == 200, f"Superadmin login failed: {login_res.text}"
        admin_token = login_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        admin_user = login_res.json()["user"]
        print(f"[OK] Logged in as Admin: {admin_user['email']} (id: {admin_user['id']})")

        # Create Agent 1 (Access to LAVVA, LUXIRA on messenger, instagram)
        agent1_email = f"agent1_{uuid.uuid4().hex[:6]}@luxira.com"
        res1 = await client.post(f"{BASE_URL}/admin/team/members", headers=admin_headers, json={
            "email": agent1_email,
            "password": "Password123!",
            "full_name": "Agent One",
            "role": "agent",
            "brand_access": ["LAVVA", "LUXIRA"],
            "channel_access": ["messenger", "instagram"],
            "is_active": True,
        })
        assert res1.status_code in (200, 201), f"Failed to create agent1: {res1.text}"
        agent1_id = res1.json()["id"]

        login1 = await client.post(f"{BASE_URL}/auth/login", json={"email": agent1_email, "password": "Password123!"})
        assert login1.status_code == 200
        agent1_token = login1.json()["access_token"]
        agent1_headers = {"Authorization": f"Bearer {agent1_token}"}
        print(f"[OK] Created & Logged in Agent 1: {agent1_email}")

        # Create Agent 2 (Access to LAVVA on messenger only)
        agent2_email = f"agent2_{uuid.uuid4().hex[:6]}@luxira.com"
        res2 = await client.post(f"{BASE_URL}/admin/team/members", headers=admin_headers, json={
            "email": agent2_email,
            "password": "Password123!",
            "full_name": "Agent Two",
            "role": "agent",
            "brand_access": ["LAVVA"],
            "channel_access": ["messenger"],
            "is_active": True,
        })
        assert res2.status_code in (200, 201), f"Failed to create agent2: {res2.text}"
        agent2_id = res2.json()["id"]

        login2 = await client.post(f"{BASE_URL}/auth/login", json={"email": agent2_email, "password": "Password123!"})
        assert login2.status_code == 200
        agent2_token = login2.json()["access_token"]
        agent2_headers = {"Authorization": f"Bearer {agent2_token}"}
        print(f"[OK] Created & Logged in Agent 2: {agent2_email}")

        # Create Supervisor (Access to ALL)
        super_email = f"supervisor_{uuid.uuid4().hex[:6]}@luxira.com"
        res_sup = await client.post(f"{BASE_URL}/admin/team/members", headers=admin_headers, json={
            "email": super_email,
            "password": "Password123!",
            "full_name": "Supervisor Sarah",
            "role": "supervisor",
            "brand_access": ["ALL"],
            "channel_access": ["ALL"],
            "is_active": True,
        })
        assert res_sup.status_code in (200, 201), f"Failed to create supervisor: {res_sup.text}"
        super_id = res_sup.json()["id"]

        login_sup = await client.post(f"{BASE_URL}/auth/login", json={"email": super_email, "password": "Password123!"})
        assert login_sup.status_code == 200
        super_token = login_sup.json()["access_token"]
        super_headers = {"Authorization": f"Bearer {super_token}"}
        print(f"[OK] Created & Logged in Supervisor: {super_email}")

        print_step("2. Setup Test Conversations Matching Permissions")
        convs_res = await client.get(f"{BASE_URL}/conversations?limit=50", headers=admin_headers)
        assert convs_res.status_code == 200
        convs = convs_res.json()["items"]
        
        # Find Conv 1: LAVVA / messenger (Both Agent 1 & Agent 2 have access)
        conv1 = next((c for c in convs if c.get("brand") == "LAVVA" and c.get("channel") == "messenger"), None)
        # Find Conv 2: LUXIRA / instagram (Agent 1 has access, Agent 2 does NOT)
        conv2 = next((c for c in convs if c.get("brand") == "LUXIRA" and c.get("channel") in ["instagram", "messenger"]), None)

        if not conv1:
            conv1 = convs[0]
        if not conv2:
            conv2 = convs[1]

        conv1_id = conv1["id"]
        conv2_id = conv2["id"]
        print(f"[OK] Using Conv 1: {conv1_id} (Brand: {conv1.get('brand')}, Channel: {conv1.get('channel')})")
        print(f"[OK] Using Conv 2: {conv2_id} (Brand: {conv2.get('brand')}, Channel: {conv2.get('channel')})")

        print_step("3. Test Outbound Messages & Quoted Reply (reply_to)")
        # Agent 1 sends message M1
        send1 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages", headers=agent1_headers, json={
            "text": "Original message from Agent 1",
        })
        assert send1.status_code in (200, 201), f"Send failed: {send1.text}"
        m1 = send1.json()
        m1_id = m1["id"]
        assert m1.get("sender_user_id") == agent1_id, "M1 sender_user_id should match Agent 1"
        assert m1.get("sender_name") == "Agent One", "M1 sender_name should match Agent 1 display name"
        print(f"[OK] Agent 1 sent M1: id={m1_id}, sender={m1.get('sender_name')}, text='{m1['text']}'")

        # Agent 2 sends message M2 replying to M1
        send2 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages", headers=agent2_headers, json={
            "text": "Reply message from Agent 2",
            "reply_to_message_id": m1_id,
        })
        assert send2.status_code in (200, 201), f"Send reply failed: {send2.text}"
        m2 = send2.json()
        m2_id = m2["id"]
        assert m2.get("reply_to") is not None, f"reply_to missing in response: {m2}"
        assert m2["reply_to"]["message_id"] == m1_id, f"Mismatched reply_to ID: {m2['reply_to']}"
        assert m2["reply_to"]["sender_name"] == "Agent One"
        print(f"[OK] Agent 2 replied with M2 (reply_to={m2['reply_to']})")

        print_step("4. Test Message Editing & RBAC Matrix")
        # A. Agent 1 edits own message M1 -> Should SUCCEED (200)
        edit1 = await client.patch(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}", headers=agent1_headers, json={
            "text": "Original message from Agent 1 (EDITED)"
        })
        assert edit1.status_code == 200, f"Agent 1 editing own message failed: {edit1.text}"
        m1_edited = edit1.json()
        assert m1_edited["is_edited"] is True, "is_edited flag not set"
        assert m1_edited["text"] == "Original message from Agent 1 (EDITED)"
        assert m1_edited["edited_by_user_id"] == agent1_id
        print(f"[OK] Agent 1 successfully edited own message: is_edited={m1_edited['is_edited']}")

        # B. Agent 2 tries to edit Agent 1's message M1 -> Should FAIL (403)
        edit2 = await client.patch(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}", headers=agent2_headers, json={
            "text": "Malicious edit attempt by Agent 2"
        })
        assert edit2.status_code == 403, f"Agent 2 should have been forbidden from editing Agent 1's message! Status: {edit2.status_code}"
        print("[OK] Agent 2 forbidden (403) from editing Agent 1's message")

        # C. Supervisor edits Agent 1's message M1 -> Should SUCCEED (200)
        edit3 = await client.patch(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}", headers=super_headers, json={
            "text": "Supervisor corrected message"
        })
        assert edit3.status_code == 200, f"Supervisor editing agent message failed: {edit3.text}"
        assert edit3.json()["text"] == "Supervisor corrected message"
        assert edit3.json()["edited_by_user_id"] == super_id
        print("[OK] Supervisor successfully edited Agent 1's message")

        # D. Admin edits Agent 1's message M1 -> Should SUCCEED (200)
        edit4 = await client.patch(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}", headers=admin_headers, json={
            "text": "Admin final message text"
        })
        assert edit4.status_code == 200, f"Admin editing message failed: {edit4.text}"
        print("[OK] Admin successfully edited message")

        print_step("5. Test Emoji Reactions Toggle")
        # A. Agent 1 reacts with ❤️
        react1 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}/reactions", headers=agent1_headers, json={
            "emoji": "❤️"
        })
        assert react1.status_code == 200, f"Reaction failed: {react1.text}"
        r_list1 = react1.json().get("reactions", [])
        assert len(r_list1) == 1, f"Expected 1 reaction, got {r_list1}"
        assert r_list1[0]["emoji"] == "❤️" and r_list1[0]["user_id"] == agent1_id
        print(f"[OK] Agent 1 added reaction ❤️: {r_list1}")

        # B. Agent 2 reacts with ❤️ to the same message
        react2 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}/reactions", headers=agent2_headers, json={
            "emoji": "❤️"
        })
        assert react2.status_code == 200
        r_list2 = react2.json().get("reactions", [])
        assert len(r_list2) == 2, f"Expected 2 reactions, got {r_list2}"
        print(f"[OK] Agent 2 added reaction ❤️: total reactions={len(r_list2)}")

        # C. Agent 1 toggles ❤️ again -> Should REMOVE Agent 1's reaction
        react3 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}/reactions", headers=agent1_headers, json={
            "emoji": "❤️"
        })
        assert react3.status_code == 200
        r_list3 = react3.json().get("reactions", [])
        assert len(r_list3) == 1, f"Expected 1 reaction remaining, got {r_list3}"
        assert r_list3[0]["user_id"] == agent2_id, "Agent 2 reaction should remain"
        print(f"[OK] Agent 1 toggled off reaction: remaining={r_list3}")

        print_step("6. Test Message Pinning Toggle")
        # A. Agent 1 pins M1
        pin1 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}/pin", headers=agent1_headers)
        assert pin1.status_code == 200, f"Pin failed: {pin1.text}"
        m1_pinned = pin1.json()
        assert m1_pinned["is_pinned"] is True, f"Expected is_pinned=True, got {m1_pinned}"
        assert m1_pinned.get("pinned_by_name") == "Agent One"
        print(f"[OK] Message pinned: is_pinned={m1_pinned['is_pinned']}, pinned_by={m1_pinned.get('pinned_by_name')}")

        # B. Agent 1 unpins M1
        pin2 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}/pin", headers=agent1_headers)
        assert pin2.status_code == 200
        assert pin2.json()["is_pinned"] is False
        print("[OK] Message unpinned successfully: is_pinned=False")

        print_step("7. Test Message Forwarding")
        # Forward M1 from conv1 to conv2 using Agent 1 (who has access to both)
        fwd1 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages/{m1_id}/forward", headers=agent1_headers, json={
            "target_conversation_id": conv2_id
        })
        assert fwd1.status_code == 200, f"Forward failed: {fwd1.text}"
        fwd_msg = fwd1.json()
        assert fwd_msg["conversation_id"] == conv2_id, f"Forwarded message should belong to target conversation"
        assert fwd_msg["forwarded"] is True, "forwarded flag should be True"
        assert fwd_msg["forwarded_from"]["original_message_id"] == m1_id
        assert fwd_msg["forwarded_from"]["original_conversation_id"] == conv1_id
        print(f"[OK] Message forwarded to Conv 2: id={fwd_msg['id']}, forwarded={fwd_msg['forwarded']}")

        print_step("8. Test Message Deletion (Soft-Delete & Redaction) & RBAC")
        # Agent 1 sends message M3
        send3 = await client.post(f"{BASE_URL}/conversations/{conv1_id}/messages", headers=agent1_headers, json={
            "text": "Message to be deleted by Agent 1",
        })
        assert send3.status_code in (200, 201)
        m3_id = send3.json()["id"]

        # A. Agent 2 tries to delete Agent 1's message M3 -> Should FAIL (403)
        del_fail = await client.delete(f"{BASE_URL}/conversations/{conv1_id}/messages/{m3_id}", headers=agent2_headers)
        assert del_fail.status_code == 403, f"Agent 2 should NOT be able to delete Agent 1's message! Status: {del_fail.status_code}"
        print("[OK] Agent 2 forbidden (403) from deleting Agent 1's message")

        # B. Agent 1 deletes own message M3 -> Should SUCCEED (200)
        del_ok = await client.delete(f"{BASE_URL}/conversations/{conv1_id}/messages/{m3_id}", headers=agent1_headers)
        assert del_ok.status_code == 200, f"Agent 1 delete failed: {del_ok.text}"
        m3_del = del_ok.json()
        assert m3_del["is_deleted"] is True, "is_deleted flag should be True"
        assert m3_del.get("text") is None or m3_del["text"] == "", "Deleted message text must be redacted"
        assert m3_del.get("deleted_by_name") == "Agent One"
        print(f"[OK] Agent 1 soft-deleted own message: is_deleted={m3_del['is_deleted']}, deleted_by={m3_del.get('deleted_by_name')}")

        # C. Supervisor deletes M2 (Agent 2's message) -> Should SUCCEED (200)
        del_sup = await client.delete(f"{BASE_URL}/conversations/{conv1_id}/messages/{m2_id}", headers=super_headers)
        assert del_sup.status_code == 200, f"Supervisor delete failed: {del_sup.text}"
        assert del_sup.json()["is_deleted"] is True
        print("[OK] Supervisor successfully deleted message M2")

        print_step("9. Verify Central Audit Log Records for Message Actions")
        audit_res = await client.get(f"{BASE_URL}/admin/team/audit-logs?page_size=50", headers=admin_headers)
        assert audit_res.status_code == 200, f"Audit query failed: {audit_res.text}"
        audit_items = audit_res.json()["items"]
        action_types = {item["action"] for item in audit_items}
        print(f"Recorded Audit Action Types: {action_types}")

        expected_actions = [
            "message.edited",
            "message.deleted",
            "message.reaction_added",
            "message.reaction_removed",
            "message.pinned",
            "message.unpinned",
            "message.forwarded",
        ]
        for action in expected_actions:
            assert action in action_types, f"Expected audit action '{action}' was not found in audit logs!"
            print(f"[OK] Found Audit Log: {action}")

        print("\n" + "="*60)
        print("ALL MESSAGE ACTIONS & RBAC AUTOMATED TESTS PASSED SUCCESSFULLY (100%)!")
        print("="*60)

if __name__ == "__main__":
    asyncio.run(run_tests())
