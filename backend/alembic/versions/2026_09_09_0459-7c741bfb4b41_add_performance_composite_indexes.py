"""add_performance_composite_indexes

Revision ID: 7c741bfb4b41
Revises: 'dbceb4858689'
Create Date: 2026-09-09 04:59:31.031819

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c741bfb4b41'
down_revision: Union[str, None] = 'dbceb4858689'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Composite Index for Unified Inbox query optimization: (brand, channel, last_message_at DESC NULLS LAST)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_conversations_brand_channel_last_msg
        ON conversations (brand, channel, last_message_at DESC NULLS LAST);
        """
    )

    # 2. Composite Index for Chat Thread Retrieval optimization: (conversation_id, created_at ASC)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_messages_conv_created_asc
        ON messages (conversation_id, created_at ASC);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_conversations_brand_channel_last_msg;")
    op.execute("DROP INDEX IF EXISTS ix_messages_conv_created_asc;")
