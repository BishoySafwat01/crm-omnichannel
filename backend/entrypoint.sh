#!/bin/sh
set -e

echo "==> Running database migrations (alembic upgrade head)..."
alembic upgrade head

PORT="${PORT:-8000}"
echo "==> Starting Uvicorn on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
