"""add channel_access to users table

Revision ID: f5a1c8e92031
Revises: b919cbfa86fa
Create Date: 2026-08-21 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f5a1c8e92031'
down_revision: Union[str, None] = 'f2bd2246d1d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'channel_access',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default='["ALL"]',
            nullable=False
        )
    )


def downgrade() -> None:
    op.drop_column('users', 'channel_access')
