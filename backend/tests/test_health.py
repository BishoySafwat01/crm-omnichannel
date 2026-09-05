from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import AsyncClient

from app.main import app, perform_health_check


@pytest.mark.asyncio
async def test_root_endpoint(async_client: AsyncClient):
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "app" in data
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_health_check_endpoint(async_client: AsyncClient):
    response = await async_client.get("/health")
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data
    assert "postgres" in data
    assert "redis" in data


@pytest.mark.asyncio
async def test_api_v1_health_check_endpoint(async_client: AsyncClient):
    response = await async_client.get("/api/v1/health")
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data
    assert "postgres" in data
    assert "redis" in data


@pytest.mark.asyncio
async def test_perform_health_check_mocked_success():
    with patch("app.main.AsyncSessionLocal") as mock_db, patch(
        "app.main.get_redis_client"
    ) as mock_redis:
        # Mock DB session execution
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_db.return_value.__aenter__.return_value = mock_session

        # Mock Redis ping
        mock_redis_client = AsyncMock()
        mock_redis_client.ping.return_value = True
        mock_redis.return_value = mock_redis_client

        body, status_code = await perform_health_check()
        assert status_code == 200
        assert body["status"] == "ok"
        assert body["postgres"] == "healthy"
        assert body["redis"] == "healthy"
