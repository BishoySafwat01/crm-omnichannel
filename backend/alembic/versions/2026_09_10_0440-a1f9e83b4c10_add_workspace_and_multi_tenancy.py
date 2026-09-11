"""add_workspace_and_multi_tenancy

Revision ID: a1f9e83b4c10
Revises: 7c741bfb4b41
Create Date: 2026-09-10 04:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1f9e83b4c10'
down_revision: Union[str, None] = '7c741bfb4b41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------
    # Step A: Create workspaces table
    # ---------------------------------------------------------
    op.create_table(
        "workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_workspaces_slug", "workspaces", ["slug"], unique=True)
    op.create_index("ix_workspaces_is_active", "workspaces", ["is_active"], unique=False)

    # ---------------------------------------------------------
    # Step B: Insert system default workspace
    # ---------------------------------------------------------
    op.execute(
        """
        INSERT INTO workspaces (id, name, slug, is_active, created_at)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', true, now())
        ON CONFLICT (id) DO NOTHING
        """
    )

    # ---------------------------------------------------------
    # Step C: Add workspace_id column & foreign keys
    # ---------------------------------------------------------
    tables = ["users", "conversations", "customers", "connected_pages"]
    for table_name in tables:
        op.add_column(
            table_name,
            sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"fk_{table_name}_workspace_id_workspaces",
            table_name,
            "workspaces",
            ["workspace_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(
            f"ix_{table_name}_workspace_id",
            table_name,
            ["workspace_id"],
            unique=False,
        )

    # ---------------------------------------------------------
    # Step D: Backfill existing rows with Default Workspace
    # (executed individually to adhere to asyncpg prepared statements)
    # ---------------------------------------------------------
    op.execute("UPDATE users SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL")
    op.execute("UPDATE conversations SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL")
    op.execute("UPDATE customers SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL")
    op.execute("UPDATE connected_pages SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL")


def downgrade() -> None:
    tables = ["connected_pages", "customers", "conversations", "users"]
    for table_name in tables:
        op.drop_constraint(f"fk_{table_name}_workspace_id_workspaces", table_name, type_="foreignkey")
        op.drop_index(f"ix_{table_name}_workspace_id", table_name=table_name)
        op.drop_column(table_name, "workspace_id")

    op.drop_index("ix_workspaces_is_active", table_name="workspaces")
    op.drop_index("ix_workspaces_slug", table_name="workspaces")
    op.drop_table("workspaces")
