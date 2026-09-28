"""Initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-03-08 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from app.models.types import GUID, JSONType, ArrayType

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'helpers',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('location', sa.String(length=128), nullable=False),
        sa.Column('experience_years', sa.Integer(), nullable=False),
        sa.Column('availability', sa.String(length=64), nullable=False),
        sa.Column('color', sa.String(length=32), nullable=False),
        sa.Column('skills', ArrayType(), nullable=False),
        sa.Column('role_scores', JSONType(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'households',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('location', sa.String(length=128), nullable=False),
        sa.Column('requirement', sa.String(length=64), nullable=False),
        sa.Column('schedule', sa.String(length=128), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'placements',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('helper_id', GUID(), nullable=False),
        sa.Column('household_id', GUID(), nullable=False),
        sa.Column('role', sa.String(length=64), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['helper_id'], ['helpers.id']),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'events',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('helper_id', GUID(), nullable=True),
        sa.Column('household_id', GUID(), nullable=True),
        sa.Column('placement_id', GUID(), nullable=True),
        sa.Column('event_type', sa.String(length=64), nullable=False),
        sa.Column('description', sa.String(length=512), nullable=False),
        sa.Column('severity', sa.String(length=16), nullable=True),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('extra_metadata', JSONType(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['helper_id'], ['helpers.id']),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.ForeignKeyConstraint(['placement_id'], ['placements.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'calls',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('idempotency_key', sa.String(length=128), nullable=True),
        sa.Column('call_type', sa.String(length=32), nullable=False),
        sa.Column('helper_id', GUID(), nullable=True),
        sa.Column('household_id', GUID(), nullable=True),
        sa.Column('reason', sa.String(length=256), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('transcript', JSONType(), nullable=False),
        sa.Column('summary', sa.String(length=512), nullable=False),
        sa.Column('sentiment', sa.String(length=32), nullable=False),
        sa.Column('follow_up', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['helper_id'], ['helpers.id']),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('idempotency_key')
    )

    op.create_table(
        'scores',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('entity_id', GUID(), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('trust', sa.Integer(), nullable=True),
        sa.Column('churn', sa.Integer(), nullable=True),
        sa.Column('difficulty', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entity_id')
    )

    op.create_table(
        'score_history',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('entity_id', GUID(), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('trust', sa.Integer(), nullable=True),
        sa.Column('churn', sa.Integer(), nullable=True),
        sa.Column('difficulty', sa.Integer(), nullable=True),
        sa.Column('reason', sa.String(length=256), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'reflections',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('entity_id', GUID(), nullable=False),
        sa.Column('classification', sa.String(length=32), nullable=False),
        sa.Column('insight', sa.String(length=512), nullable=False),
        sa.Column('evidence', ArrayType(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'recommendations',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('entity_id', GUID(), nullable=False),
        sa.Column('text', sa.String(length=512), nullable=False),
        sa.Column('action', sa.String(length=128), nullable=False),
        sa.Column('call_type', sa.String(length=32), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'staged_backups',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('household_id', GUID(), nullable=False),
        sa.Column('at_risk_helper_id', GUID(), nullable=False),
        sa.Column('backup_helper_id', GUID(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['household_id'], ['households.id']),
        sa.ForeignKeyConstraint(['at_risk_helper_id'], ['helpers.id']),
        sa.ForeignKeyConstraint(['backup_helper_id'], ['helpers.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('agent', sa.String(length=64), nullable=False),
        sa.Column('action', sa.String(length=128), nullable=False),
        sa.Column('entity_id', GUID(), nullable=True),
        sa.Column('details', JSONType(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'users',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('email', sa.String(length=256), nullable=False),
        sa.Column('full_name', sa.String(length=128), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )

def downgrade() -> None:
    op.drop_table('users')
    op.drop_table('audit_logs')
    op.drop_table('staged_backups')
    op.drop_table('recommendations')
    op.drop_table('reflections')
    op.drop_table('score_history')
    op.drop_table('scores')
    op.drop_table('calls')
    op.drop_table('events')
    op.drop_table('placements')
    op.drop_table('households')
    op.drop_table('helpers')
