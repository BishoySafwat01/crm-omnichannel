import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_privacy_policy_endpoint(async_client: AsyncClient):
    response = await async_client.get("/privacy-policy")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "Privacy Policy" in response.text
    assert "LUXIRA CRM" in response.text
    assert "bishoysafwat2004@gmail.com" in response.text


@pytest.mark.asyncio
async def test_terms_of_service_endpoint(async_client: AsyncClient):
    response = await async_client.get("/terms-of-service")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "Terms of Service" in response.text
    assert "LUXIRA CRM" in response.text
    assert "bishoysafwat2004@gmail.com" in response.text


@pytest.mark.asyncio
async def test_data_deletion_instructions_endpoint(async_client: AsyncClient):
    response = await async_client.get("/data-deletion")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "User Data Deletion Instructions" in response.text
    assert "bishoysafwat2004@gmail.com" in response.text
    assert "48 hours" in response.text or "48-Hour" in response.text


@pytest.mark.asyncio
async def test_data_deletion_with_confirmation_id(async_client: AsyncClient):
    response = await async_client.get("/data-deletion?id=test_code_12345")
    assert response.status_code == 200
    assert "test_code_12345" in response.text
    assert "Data Deletion Request Recorded" in response.text


@pytest.mark.asyncio
async def test_meta_data_deletion_callback_post(async_client: AsyncClient):
    response = await async_client.post(
        "/data-deletion",
        data={"signed_request": "mock_signed_request_payload"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "url" in data
    assert "confirmation_code" in data
    assert "/data-deletion?id=" in data["url"]


@pytest.mark.asyncio
async def test_legal_endpoints_accessible_under_api_v1(async_client: AsyncClient):
    resp1 = await async_client.get("/api/v1/privacy-policy")
    assert resp1.status_code == 200

    resp2 = await async_client.get("/api/v1/terms-of-service")
    assert resp2.status_code == 200

    resp3 = await async_client.get("/api/v1/data-deletion")
    assert resp3.status_code == 200
