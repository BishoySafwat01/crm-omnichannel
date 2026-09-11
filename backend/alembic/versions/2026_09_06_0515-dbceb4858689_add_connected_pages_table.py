"""add_connected_pages_table

Revision ID: dbceb4858689
Revises: 'b57db77d7a85'
Create Date: 2026-09-06 05:15:22.634706

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'dbceb4858689'
down_revision: Union[str, None] = 'b57db77d7a85'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'connected_pages',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('page_id', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('encrypted_access_token', sa.Text(), nullable=False),
        sa.Column('category', sa.String(length=255), nullable=True),
        sa.Column('instagram_business_account_id', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=32), server_default='ACTIVE', nullable=False),
        sa.Column('is_webhook_subscribed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('connected_by_user_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['connected_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_connected_pages_connected_by_user_id'), 'connected_pages', ['connected_by_user_id'], unique=False)
    op.create_index(op.f('ix_connected_pages_page_id'), 'connected_pages', ['page_id'], unique=True)
    op.create_index(op.f('ix_connected_pages_status'), 'connected_pages', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_connected_pages_status'), table_name='connected_pages')
    op.drop_index(op.f('ix_connected_pages_page_id'), table_name='connected_pages')
    op.drop_index(op.f('ix_connected_pages_connected_by_user_id'), table_name='connected_pages')
    op.drop_table('connected_pages')
