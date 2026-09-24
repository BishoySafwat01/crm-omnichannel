"""add_soft_delete_and_cascade_indexes

Revision ID: e4d7a8c1f2b3
Revises: b2e8a1c3d4f5
Create Date: 2026-09-24 17:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e4d7a8c1f2b3'
down_revision: Union[str, None] = 'b2e8a1c3d4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. connected_pages deleted_at
    op.execute("ALTER TABLE connected_pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_connected_pages_deleted_at ON connected_pages(deleted_at);")

    # 2. conversations deleted_at, page_id, connected_page_id
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;")
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS page_id VARCHAR(64) NULL;")
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS connected_page_id UUID NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations(deleted_at);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_conversations_page_id ON conversations(page_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_conversations_connected_page_id ON conversations(connected_page_id);")

    # 3. messages deleted_at
    op.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_messages_deleted_at;")
    op.execute("ALTER TABLE messages DROP COLUMN IF EXISTS deleted_at;")

    op.execute("DROP INDEX IF EXISTS idx_conversations_connected_page_id;")
    op.execute("DROP INDEX IF EXISTS idx_conversations_page_id;")
    op.execute("DROP INDEX IF EXISTS idx_conversations_deleted_at;")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS connected_page_id;")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS page_id;")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS deleted_at;")

    op.execute("DROP INDEX IF EXISTS idx_connected_pages_deleted_at;")
    op.execute("ALTER TABLE connected_pages DROP COLUMN IF EXISTS deleted_at;")
