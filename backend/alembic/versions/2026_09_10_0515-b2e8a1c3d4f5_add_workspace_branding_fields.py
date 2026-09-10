"""add_workspace_branding_fields

Revision ID: b2e8a1c3d4f5
Revises: a1f9e83b4c10
Create Date: 2026-09-10 05:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2e8a1c3d4f5'
down_revision: Union[str, None] = 'a1f9e83b4c10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add additive, non-destructive columns to workspaces
    op.add_column(
        "workspaces",
        sa.Column(
            "brand_display_name",
            sa.String(length=255),
            nullable=True,
            server_default=sa.text("'LUXIRA Omnichannel CRM'"),
        ),
    )
    op.add_column(
        "workspaces",
        sa.Column("brand_logo_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("favicon_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column(
            "theme_primary_color",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'#1A73E8'"),
        ),
    )
    op.add_column(
        "workspaces",
        sa.Column("canned_responses", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "workspaces",
        sa.Column("custom_domain", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_workspaces_custom_domain", "workspaces", ["custom_domain"], unique=False)

    # 2. Update default workspace row with official LUXIRA enterprise branding
    op.execute(
        """
        UPDATE workspaces
        SET name = 'LUXIRA Group',
            brand_display_name = 'مجموعة لوكسيرا - نظام إدارة العملاء الموحد'
        WHERE id = '00000000-0000-0000-0000-000000000001'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_workspaces_custom_domain", table_name="workspaces")
    op.drop_column("workspaces", "custom_domain")
    op.drop_column("workspaces", "canned_responses")
    op.drop_column("workspaces", "theme_primary_color")
    op.drop_column("workspaces", "favicon_url")
    op.drop_column("workspaces", "brand_logo_url")
    op.drop_column("workspaces", "brand_display_name")
