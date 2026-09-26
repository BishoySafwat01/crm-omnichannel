"""add built-in automation settings

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-09-26 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "automation_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "location_bot_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "location_prompt_1",
            sa.Text(),
            server_default="يا هلا",
            nullable=False,
        ),
        sa.Column(
            "location_prompt_2",
            sa.Text(),
            server_default="حضرتك من اي دولة ؟",
            nullable=False,
        ),
        sa.Column(
            "order_completion_bot_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text(
            "INSERT INTO automation_settings (id) VALUES (1) "
            "ON CONFLICT (id) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.drop_table("automation_settings")
