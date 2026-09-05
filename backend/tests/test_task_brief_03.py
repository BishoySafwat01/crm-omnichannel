import io
import uuid
import pytest
from httpx import AsyncClient

from app.core.database import AsyncSessionLocal
from app.models import ChannelEnum, Conversation, Customer, ProviderEnum
from app.services.meta_import_service import MetaImportService


@pytest.mark.asyncio
async def test_media_upload_endpoint(async_client: AsyncClient):
    """Test media upload endpoint with sample file content."""
    file_bytes = b"sample image content data"
    files = {"file": ("test_image.png", io.BytesIO(file_bytes), "image/png")}
    response = await async_client.post("/api/v1/media/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["filename"] == "test_image.png"
    assert data["mime_type"] == "image/png"
    assert data["media_type"] == "image"
    assert data["url"].startswith("/uploads/")


@pytest.mark.asyncio
async def test_conversation_assignment_endpoint(async_client: AsyncClient):
    """Test PATCH /api/v1/conversations/{id}/assign."""
    async with AsyncSessionLocal() as db_session:
        customer = Customer(display_name="Test Customer")
        db_session.add(customer)
        await db_session.commit()

        conv = Conversation(
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="conv_assign_test_100",
        )
        db_session.add(conv)
        await db_session.commit()
        conv_id = conv.id

    response = await async_client.patch(
        f"/api/v1/conversations/{conv_id}/assign",
        json={"agent_id": "أحمد محمود"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["assigned_agent_id"] == "أحمد محمود"

    # Verify database persistence
    async with AsyncSessionLocal() as db_session:
        updated = await db_session.get(Conversation, conv_id)
        assert updated is not None
        assert updated.assigned_agent_id == "أحمد محمود"


@pytest.mark.asyncio
async def test_conversation_priority_endpoint(async_client: AsyncClient):
    """Test PATCH /api/v1/conversations/{id}/priority."""
    async with AsyncSessionLocal() as db_session:
        customer = Customer(display_name="Priority Customer")
        db_session.add(customer)
        await db_session.commit()

        conv = Conversation(
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="conv_priority_test_100",
        )
        db_session.add(conv)
        await db_session.commit()
        conv_id = conv.id

    # Valid priority
    response = await async_client.patch(
        f"/api/v1/conversations/{conv_id}/priority",
        json={"priority": "urgent"},
    )
    assert response.status_code == 200
    assert response.json()["priority"] == "urgent"

    # Invalid priority
    invalid_resp = await async_client.patch(
        f"/api/v1/conversations/{conv_id}/priority",
        json={"priority": "super_high"},
    )
    assert invalid_resp.status_code == 400


@pytest.mark.asyncio
async def test_inbound_media_caching_helper():
    """Test MetaImportService.download_and_cache_media non-http fallback."""
    url = "/local/path/file.png"
    cached = await MetaImportService.download_and_cache_media(url)
    assert cached == url
