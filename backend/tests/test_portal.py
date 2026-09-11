import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_portal_branding_unauthenticated(unauth_client: AsyncClient):
    """Verifies that GET /api/v1/portal/branding is publicly accessible for login page & shell."""
    response = await unauth_client.get("/api/v1/portal/branding")
    assert response.status_code == 200
    data = response.json()
    assert "workspace_id" in data
    assert "workspace_name" in data
    assert "brand_display_name" in data
    assert "theme_primary_color" in data


@pytest.mark.asyncio
async def test_get_portal_branding_authenticated(async_client: AsyncClient):
    """Verifies that GET /api/v1/portal/branding returns branding for authenticated user."""
    response = await async_client.get("/api/v1/portal/branding")
    assert response.status_code == 200
    data = response.json()
    assert data["workspace_name"] == "LUXIRA Group"
    assert data["theme_primary_color"] is not None


@pytest.mark.asyncio
async def test_patch_portal_branding_unauthenticated_rejected(unauth_client: AsyncClient):
    """Verifies that PATCH /api/v1/portal/branding requires authentication."""
    response = await unauth_client.patch(
        "/api/v1/portal/branding",
        json={"brand_display_name": "Unauthorized Brand"},
    )
    assert response.status_code in [401, 403]


@pytest.mark.asyncio
async def test_patch_portal_branding_success(async_client: AsyncClient):
    """Verifies that admin can update portal branding attributes."""
    update_payload = {
        "brand_display_name": "LUXIRA Enterprise Suite",
        "theme_primary_color": "#0D9488",
        "brand_logo_url": "https://example.com/logo.png",
        "favicon_url": "https://example.com/favicon.ico",
    }
    response = await async_client.patch(
        "/api/v1/portal/branding",
        json=update_payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["brand_display_name"] == "LUXIRA Enterprise Suite"
    assert data["theme_primary_color"] == "#0D9488"
    assert data["brand_logo_url"] == "https://example.com/logo.png"
    assert data["favicon_url"] == "https://example.com/favicon.ico"

    # Verify retrieval reflects the updated branding
    get_res = await async_client.get("/api/v1/portal/branding")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["brand_display_name"] == "LUXIRA Enterprise Suite"
    assert get_data["theme_primary_color"] == "#0D9488"
