"""Store community photos in the database (serverless hosts have no persistent disk)

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("community_reports", sa.Column("photo_data", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("community_reports", "photo_data")
