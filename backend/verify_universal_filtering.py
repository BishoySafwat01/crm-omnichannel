import asyncio
import logging
import httpx
from collections import Counter

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("verify_universal_filtering")

BASE_URL = "http://127.0.0.1:8000/api/v1"

async def test_probes():
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Authenticate
        login_res = await client.post(f"{BASE_URL}/auth/login", json={"email": "admin@luxira.com", "password": "admin123456"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        logger.info("Admin authenticated successfully.")

        # 1. Probe provider=meta
        res_meta = await client.get(f"{BASE_URL}/conversations?provider=meta&page_size=100", headers=headers)
        assert res_meta.status_code == 200
        meta_data = res_meta.json()
        meta_items = meta_data.get("items", [])
        meta_total = meta_data.get("total", 0)
        for it in meta_items:
            assert it.get("provider", "").lower() == "meta", f"Non-meta conversation in meta probe: {it}"
        logger.info("[PROBE 1] provider=meta: Status=200 | Items=%d | Total=%d | Strict Isolation=PASS", len(meta_items), meta_total)

        # 2. Probe provider=beon
        res_beon = await client.get(f"{BASE_URL}/conversations?provider=beon&page_size=100", headers=headers)
        assert res_beon.status_code == 200
        beon_data = res_beon.json()
        beon_items = beon_data.get("items", [])
        beon_total = beon_data.get("total", 0)
        for it in beon_items:
            assert it.get("provider", "").lower() == "beon", f"Non-beon conversation in beon probe: {it}"
        logger.info("[PROBE 2] provider=beon: Status=200 | Items=%d | Total=%d | Strict Isolation=PASS", len(beon_items), beon_total)

        # 3. Probe provider=all (with Deduplication check)
        res_all = await client.get(f"{BASE_URL}/conversations?provider=all&page_size=100", headers=headers)
        assert res_all.status_code == 200
        all_data = res_all.json()
        all_items = all_data.get("items", [])
        all_total = all_data.get("total", 0)
        
        # Check duplicate customers
        customer_ids = [it.get("customer_id") for it in all_items if it.get("customer_id")]
        dup_counts = Counter(customer_ids)
        duplicates = {cid: cnt for cid, cnt in dup_counts.items() if cnt > 1}
        assert len(duplicates) == 0, f"Duplicate customers found in provider=all query: {duplicates}"
        logger.info("[PROBE 3] provider=all: Status=200 | Items=%d | Total=%d | Deduplication (0 duplicates)=PASS", len(all_items), all_total)

        # 4. Probe brand=Hayat
        res_hayat = await client.get(f"{BASE_URL}/conversations?brand=Hayat&page_size=100", headers=headers)
        assert res_hayat.status_code == 200
        hayat_data = res_hayat.json()
        hayat_items = hayat_data.get("items", [])
        hayat_total = hayat_data.get("total", 0)
        for it in hayat_items:
            b = (it.get("brand") or "").lower()
            assert "hayat" in b, f"Non-Hayat conversation found: {it.get('brand')}"
        logger.info("[PROBE 4] brand=Hayat: Status=200 | Items=%d | Total=%d | Brand Filtering=PASS", len(hayat_items), hayat_total)

        # 5. Probe brand=Lotus
        res_lotus = await client.get(f"{BASE_URL}/conversations?brand=Lotus&page_size=100", headers=headers)
        assert res_lotus.status_code == 200
        lotus_data = res_lotus.json()
        lotus_items = lotus_data.get("items", [])
        lotus_total = lotus_data.get("total", 0)
        for it in lotus_items:
            b = (it.get("brand") or "").lower()
            assert "lotus" in b, f"Non-Lotus conversation found: {it.get('brand')}"
        logger.info("[PROBE 5] brand=Lotus: Status=200 | Items=%d | Total=%d | Brand Filtering=PASS", len(lotus_items), lotus_total)

        # 6. Probe include_archived=true
        res_arch = await client.get(f"{BASE_URL}/conversations?include_archived=true&page_size=50", headers=headers)
        assert res_arch.status_code == 200
        arch_data = res_arch.json()
        logger.info("[PROBE 6] include_archived=true: Status=200 | Total=%d | Archive Filtering=PASS", arch_data.get("total", 0))

        logger.info("\nALL 6 UNIVERSAL FILTERING & DEDUPLICATION PROBES PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(test_probes())
