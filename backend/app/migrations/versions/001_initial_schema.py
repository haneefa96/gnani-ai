"""Initial schema for Saakshi.

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-11-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Workers table
    op.create_table(
        'workers',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('alias', sa.String(), nullable=False, unique=True),
        sa.Column('pin_hash', sa.String(), nullable=False),
        sa.Column('language', sa.String(), default='hi-IN'),
        sa.Column('consent_audio_uri', sa.String(), nullable=True),
        sa.Column('consent_text_version', sa.String(), nullable=True),
        sa.Column('consent_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Counterparties table
    op.create_table(
        'counterparties',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('worker_id', sa.Integer(), sa.ForeignKey('workers.id'), nullable=False),
        sa.Column('display_name', sa.String(), nullable=False),
        sa.Column('phone_optional', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )

    # Entries table
    op.create_table(
        'entries',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('worker_id', sa.Integer(), sa.ForeignKey('workers.id'), nullable=False),
        sa.Column('counterparty_id', sa.Integer(), sa.ForeignKey('counterparties.id'), nullable=True),
        sa.Column('work_date', sa.String(), nullable=False),
        sa.Column('site_name', sa.String(), nullable=True),
        sa.Column('counterparty_name', sa.String(), nullable=True),
        sa.Column('work_type', sa.String(), nullable=True),
        sa.Column('hours', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('days', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('agreed_inr', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('paid_inr', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('due_inr', sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column('language', sa.String(), default='hi-IN'),
        sa.Column('transcript', sa.Text(), nullable=True),
        sa.Column('transcript_sha256', sa.String(64), nullable=True),
        sa.Column('audio_uri', sa.String(), nullable=True),
        sa.Column('audio_sha256', sa.String(64), nullable=True),
        sa.Column('prev_hash', sa.String(64), nullable=False),
        sa.Column('entry_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.Column('status', sa.String(), default='DRAFT', nullable=False),
        sa.Column('corrects_entry_id', sa.Integer(), sa.ForeignKey('entries.id'), nullable=True),
    )

    # Entry status log table
    op.create_table(
        'entry_status_log',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('entry_id', sa.Integer(), sa.ForeignKey('entries.id'), nullable=False),
        sa.Column('from_status', sa.String(), nullable=True),
        sa.Column('to_status', sa.String(), nullable=False),
        sa.Column('actor', sa.String(), nullable=False),
        sa.Column('at', sa.DateTime(), default=sa.func.now()),
    )

    # Share tokens table
    op.create_table(
        'share_tokens',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('entry_id', sa.Integer(), sa.ForeignKey('entries.id'), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )

    # Confirmations table
    op.create_table(
        'confirmations',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('entry_id', sa.Integer(), sa.ForeignKey('entries.id'), nullable=False),
        sa.Column('party', sa.String(), nullable=False),
        sa.Column('channel', sa.String(), nullable=True),
        sa.Column('audio_uri', sa.String(), nullable=True),
        sa.Column('transcript', sa.Text(), nullable=True),
        sa.Column('result', sa.String(), nullable=False),
        sa.Column('reason_text', sa.Text(), nullable=True),
        sa.Column('at', sa.DateTime(), default=sa.func.now()),
    )

    # Evidence packs table
    op.create_table(
        'evidence_packs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('worker_id', sa.Integer(), sa.ForeignKey('workers.id'), nullable=False),
        sa.Column('period_from', sa.String(), nullable=False),
        sa.Column('period_to', sa.String(), nullable=False),
        sa.Column('pdf_uri', sa.String(), nullable=True),
        sa.Column('zip_uri', sa.String(), nullable=True),
        sa.Column('chain_head_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('evidence_packs')
    op.drop_table('confirmations')
    op.drop_table('share_tokens')
    op.drop_table('entry_status_log')
    op.drop_table('entries')
    op.drop_table('counterparties')
    op.drop_table('workers')
