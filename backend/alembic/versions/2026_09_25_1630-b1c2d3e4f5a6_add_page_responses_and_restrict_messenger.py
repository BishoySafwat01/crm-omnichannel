"""add_page_responses_and_restrict_messenger

Revision ID: b1c2d3e4f5a6
Revises: f6a8b1c2d3e4
Create Date: 2026-09-25 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'f6a8b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add page_responses JSONB column to automation_rules
    op.execute("ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS page_responses JSONB DEFAULT '{}'::jsonb;")

    # 2. Restrict all existing automation rules to the messenger channel only
    op.execute("UPDATE automation_rules SET channels = '[\"messenger\"]'::jsonb;")


def downgrade() -> None:
    op.execute("ALTER TABLE automation_rules DROP COLUMN IF EXISTS page_responses;")
