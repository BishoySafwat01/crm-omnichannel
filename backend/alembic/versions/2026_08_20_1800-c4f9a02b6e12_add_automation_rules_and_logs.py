"""add automation rules and execution logs tables

Revision ID: c4f9a02b6e12
Revises: b3e89f41a021
Create Date: 2026-08-20 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c4f9a02b6e12'
down_revision: Union[str, None] = 'b3e89f41a021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create automation_rules table
    op.create_table(
        'automation_rules',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('brand_id', sa.String(length=100), nullable=True),
        sa.Column('channels', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('trigger_type', sa.String(length=50), nullable=False, server_default='keyword_match'),
        sa.Column('match_type', sa.String(length=50), nullable=False, server_default='contains'),
        sa.Column('keywords', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('response_text', sa.Text(), nullable=False),
        sa.Column('response_media_url', sa.Text(), nullable=True),
        sa.Column('cooldown_minutes', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_automation_rules_brand_id'), 'automation_rules', ['brand_id'], unique=False)
    op.create_index(op.f('ix_automation_rules_is_active'), 'automation_rules', ['is_active'], unique=False)

    # 2. Create automation_execution_logs table
    op.create_table(
        'automation_execution_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('rule_id', sa.UUID(), nullable=False),
        sa.Column('conversation_id', sa.UUID(), nullable=False),
        sa.Column('customer_id', sa.UUID(), nullable=False),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['rule_id'], ['automation_rules.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_automation_execution_logs_rule_id'), 'automation_execution_logs', ['rule_id'], unique=False)
    op.create_index(op.f('ix_automation_execution_logs_conversation_id'), 'automation_execution_logs', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_automation_execution_logs_customer_id'), 'automation_execution_logs', ['customer_id'], unique=False)
    op.create_index(op.f('ix_automation_execution_logs_executed_at'), 'automation_execution_logs', ['executed_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_automation_execution_logs_executed_at'), table_name='automation_execution_logs')
    op.drop_index(op.f('ix_automation_execution_logs_customer_id'), table_name='automation_execution_logs')
    op.drop_index(op.f('ix_automation_execution_logs_conversation_id'), table_name='automation_execution_logs')
    op.drop_index(op.f('ix_automation_execution_logs_rule_id'), table_name='automation_execution_logs')
    op.drop_table('automation_execution_logs')

    op.drop_index(op.f('ix_automation_rules_is_active'), table_name='automation_rules')
    op.drop_index(op.f('ix_automation_rules_brand_id'), table_name='automation_rules')
    op.drop_table('automation_rules')
