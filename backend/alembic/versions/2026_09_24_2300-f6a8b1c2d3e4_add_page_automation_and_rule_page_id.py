"""add_page_automation_and_rule_page_id

Revision ID: f6a8b1c2d3e4
Revises: e4d7a8c1f2b3
Create Date: 2026-09-24 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f6a8b1c2d3e4'
down_revision: Union[str, None] = 'e4d7a8c1f2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add is_automation_enabled to connected_pages
    op.execute("ALTER TABLE connected_pages ADD COLUMN IF NOT EXISTS is_automation_enabled BOOLEAN NOT NULL DEFAULT TRUE;")

    # 2. Add page_id to automation_rules and index it
    op.execute("ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS page_id VARCHAR(64) NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_automation_rules_page_id ON automation_rules(page_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_automation_rules_page_id;")
    op.execute("ALTER TABLE automation_rules DROP COLUMN IF EXISTS page_id;")
    op.execute("ALTER TABLE connected_pages DROP COLUMN IF EXISTS is_automation_enabled;")
