"""merge multiple heads

Revision ID: 32b4b17e4cfe
Revises: ('f2bd2246d1d0', 'b57db77d7a85')
Create Date: 2026-08-24 02:23:29.419661

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32b4b17e4cfe'
down_revision: Union[str, None] = ('f2bd2246d1d0', 'b57db77d7a85')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
