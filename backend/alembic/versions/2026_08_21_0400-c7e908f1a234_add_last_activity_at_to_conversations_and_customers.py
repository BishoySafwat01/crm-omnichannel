"""add_last_activity_at_to_conversations_and_customers

Revision ID: c7e908f1a234
Revises: b6c5908d0c93
Create Date: 2026-08-21 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e908f1a234'
down_revision: Union[str, None] = 'b6c5908d0c93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add last_activity_at to conversations
    op.add_column('conversations', sa.Column('last_activity_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.create_index(op.f('ix_conversations_last_activity_at'), 'conversations', ['last_activity_at'], unique=False)

    # Add last_activity_at to customers
    op.add_column('customers', sa.Column('last_activity_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.create_index(op.f('ix_customers_last_activity_at'), 'customers', ['last_activity_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_customers_last_activity_at'), table_name='customers')
    op.drop_column('customers', 'last_activity_at')

    op.drop_index(op.f('ix_conversations_last_activity_at'), table_name='conversations')
    op.drop_column('conversations', 'last_activity_at')
