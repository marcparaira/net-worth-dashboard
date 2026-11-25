"""Initial schema: users, categories, holdings, liabilities, snapshots, values, rebalancing settings.

Revision ID: 0001
Revises:
Create Date: 2026-11-25 11:07:21.046350
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('locale', sa.String(length=16), nullable=True),
        sa.Column('currency', sa.String(length=3), server_default='EUR', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
        sa.UniqueConstraint('subject', name=op.f('uq_users_subject')),
    )
    op.create_table(
        'categories',
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('excluded_from_disposable', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('excluded_from_rebalancing', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], name=op.f('fk_categories_user_id_users'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_categories')),
        sa.UniqueConstraint('user_id', 'name', name=op.f('uq_categories_user_id_name')),
    )
    op.create_index(op.f('ix_categories_user_id'), 'categories', ['user_id'], unique=False)
    op.create_table(
        'rebalancing_buckets',
        sa.Column('parent_id', sa.Uuid(), nullable=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('weight', sa.Float(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('fill_position', sa.Integer(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('weight > 0', name=op.f('ck_rebalancing_buckets_weight')),
        sa.ForeignKeyConstraint(
            ['parent_id'],
            ['rebalancing_buckets.id'],
            name=op.f('fk_rebalancing_buckets_parent_id_rebalancing_buckets'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], name=op.f('fk_rebalancing_buckets_user_id_users'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_rebalancing_buckets')),
    )
    op.create_index(op.f('ix_rebalancing_buckets_parent_id'), 'rebalancing_buckets', ['parent_id'], unique=False)
    op.create_index(op.f('ix_rebalancing_buckets_user_id'), 'rebalancing_buckets', ['user_id'], unique=False)
    op.create_table(
        'rebalancing_reserves',
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('fill_position', sa.Integer(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('amount >= 0', name=op.f('ck_rebalancing_reserves_amount')),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], name=op.f('fk_rebalancing_reserves_user_id_users'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_rebalancing_reserves')),
        sa.UniqueConstraint('user_id', 'name', name=op.f('uq_rebalancing_reserves_user_id_name')),
    )
    op.create_index(op.f('ix_rebalancing_reserves_user_id'), 'rebalancing_reserves', ['user_id'], unique=False)
    op.create_table(
        'snapshots',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_snapshots_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_snapshots')),
        sa.UniqueConstraint('user_id', 'date', name=op.f('uq_snapshots_user_id_date')),
    )
    op.create_index(op.f('ix_snapshots_user_id'), 'snapshots', ['user_id'], unique=False)
    op.create_table(
        'holdings',
        sa.Column('ref', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('category_id', sa.Uuid(), nullable=False),
        sa.Column('liquidity', sa.String(length=20), nullable=False),
        sa.Column('closed_on', sa.Date(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("liquidity IN ('liquid', 'non_liquid')", name=op.f('ck_holdings_liquidity')),
        sa.ForeignKeyConstraint(
            ['category_id'], ['categories.id'], name=op.f('fk_holdings_category_id_categories'), ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_holdings_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_holdings')),
        sa.UniqueConstraint('user_id', 'ref', name=op.f('uq_holdings_user_id_ref')),
    )
    op.create_index(op.f('ix_holdings_category_id'), 'holdings', ['category_id'], unique=False)
    op.create_index(op.f('ix_holdings_user_id'), 'holdings', ['user_id'], unique=False)
    op.create_table(
        'rebalancing_reserve_categories',
        sa.Column('reserve_id', sa.Uuid(), nullable=False),
        sa.Column('category_id', sa.Uuid(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(
            ['category_id'],
            ['categories.id'],
            name=op.f('fk_rebalancing_reserve_categories_category_id_categories'),
            ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['reserve_id'],
            ['rebalancing_reserves.id'],
            name=op.f('fk_rebalancing_reserve_categories_reserve_id_rebalancing_reserves'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], name=op.f('fk_rebalancing_reserve_categories_user_id_users'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_rebalancing_reserve_categories')),
        sa.UniqueConstraint(
            'reserve_id', 'category_id', name=op.f('uq_rebalancing_reserve_categories_reserve_id_category_id')
        ),
    )
    op.create_index(
        op.f('ix_rebalancing_reserve_categories_reserve_id'),
        'rebalancing_reserve_categories',
        ['reserve_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_rebalancing_reserve_categories_user_id'), 'rebalancing_reserve_categories', ['user_id'], unique=False
    )
    op.create_table(
        'liabilities',
        sa.Column('ref', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('holding_id', sa.Uuid(), nullable=True),
        sa.Column('closed_on', sa.Date(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(
            ['holding_id'], ['holdings.id'], name=op.f('fk_liabilities_holding_id_holdings'), ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], name=op.f('fk_liabilities_user_id_users'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_liabilities')),
        sa.UniqueConstraint('holding_id', name=op.f('uq_liabilities_holding_id')),
        sa.UniqueConstraint('user_id', 'ref', name=op.f('uq_liabilities_user_id_ref')),
    )
    op.create_index(op.f('ix_liabilities_user_id'), 'liabilities', ['user_id'], unique=False)
    op.create_table(
        'rebalancing_bucket_members',
        sa.Column('bucket_id', sa.Uuid(), nullable=False),
        sa.Column('category_id', sa.Uuid(), nullable=True),
        sa.Column('holding_id', sa.Uuid(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            '(category_id IS NULL) <> (holding_id IS NULL)', name=op.f('ck_rebalancing_bucket_members_one_target')
        ),
        sa.ForeignKeyConstraint(
            ['bucket_id'],
            ['rebalancing_buckets.id'],
            name=op.f('fk_rebalancing_bucket_members_bucket_id_rebalancing_buckets'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['category_id'],
            ['categories.id'],
            name=op.f('fk_rebalancing_bucket_members_category_id_categories'),
            ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['holding_id'],
            ['holdings.id'],
            name=op.f('fk_rebalancing_bucket_members_holding_id_holdings'),
            ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], name=op.f('fk_rebalancing_bucket_members_user_id_users'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_rebalancing_bucket_members')),
        sa.UniqueConstraint(
            'bucket_id', 'category_id', name=op.f('uq_rebalancing_bucket_members_bucket_id_category_id')
        ),
        sa.UniqueConstraint('bucket_id', 'holding_id', name=op.f('uq_rebalancing_bucket_members_bucket_id_holding_id')),
    )
    op.create_index(
        op.f('ix_rebalancing_bucket_members_bucket_id'), 'rebalancing_bucket_members', ['bucket_id'], unique=False
    )
    op.create_index(
        op.f('ix_rebalancing_bucket_members_user_id'), 'rebalancing_bucket_members', ['user_id'], unique=False
    )
    op.create_table(
        'snapshot_values',
        sa.Column('snapshot_id', sa.Uuid(), nullable=False),
        sa.Column('holding_id', sa.Uuid(), nullable=True),
        sa.Column('liability_id', sa.Uuid(), nullable=True),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            '(holding_id IS NULL) <> (liability_id IS NULL)', name=op.f('ck_snapshot_values_one_target')
        ),
        sa.ForeignKeyConstraint(
            ['holding_id'], ['holdings.id'], name=op.f('fk_snapshot_values_holding_id_holdings'), ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['liability_id'],
            ['liabilities.id'],
            name=op.f('fk_snapshot_values_liability_id_liabilities'),
            ondelete='RESTRICT',
        ),
        sa.ForeignKeyConstraint(
            ['snapshot_id'], ['snapshots.id'], name=op.f('fk_snapshot_values_snapshot_id_snapshots'), ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['user_id'], ['users.id'], name=op.f('fk_snapshot_values_user_id_users'), ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_snapshot_values')),
        sa.UniqueConstraint('snapshot_id', 'holding_id', name=op.f('uq_snapshot_values_snapshot_id_holding_id')),
        sa.UniqueConstraint('snapshot_id', 'liability_id', name=op.f('uq_snapshot_values_snapshot_id_liability_id')),
    )
    op.create_index(op.f('ix_snapshot_values_holding_id'), 'snapshot_values', ['holding_id'], unique=False)
    op.create_index(op.f('ix_snapshot_values_liability_id'), 'snapshot_values', ['liability_id'], unique=False)
    op.create_index(op.f('ix_snapshot_values_snapshot_id'), 'snapshot_values', ['snapshot_id'], unique=False)
    op.create_index(op.f('ix_snapshot_values_user_id'), 'snapshot_values', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_snapshot_values_user_id'), table_name='snapshot_values')
    op.drop_index(op.f('ix_snapshot_values_snapshot_id'), table_name='snapshot_values')
    op.drop_index(op.f('ix_snapshot_values_liability_id'), table_name='snapshot_values')
    op.drop_index(op.f('ix_snapshot_values_holding_id'), table_name='snapshot_values')
    op.drop_table('snapshot_values')
    op.drop_index(op.f('ix_rebalancing_bucket_members_user_id'), table_name='rebalancing_bucket_members')
    op.drop_index(op.f('ix_rebalancing_bucket_members_bucket_id'), table_name='rebalancing_bucket_members')
    op.drop_table('rebalancing_bucket_members')
    op.drop_index(op.f('ix_liabilities_user_id'), table_name='liabilities')
    op.drop_table('liabilities')
    op.drop_index(op.f('ix_rebalancing_reserve_categories_user_id'), table_name='rebalancing_reserve_categories')
    op.drop_index(op.f('ix_rebalancing_reserve_categories_reserve_id'), table_name='rebalancing_reserve_categories')
    op.drop_table('rebalancing_reserve_categories')
    op.drop_index(op.f('ix_holdings_user_id'), table_name='holdings')
    op.drop_index(op.f('ix_holdings_category_id'), table_name='holdings')
    op.drop_table('holdings')
    op.drop_index(op.f('ix_snapshots_user_id'), table_name='snapshots')
    op.drop_table('snapshots')
    op.drop_index(op.f('ix_rebalancing_reserves_user_id'), table_name='rebalancing_reserves')
    op.drop_table('rebalancing_reserves')
    op.drop_index(op.f('ix_rebalancing_buckets_user_id'), table_name='rebalancing_buckets')
    op.drop_index(op.f('ix_rebalancing_buckets_parent_id'), table_name='rebalancing_buckets')
    op.drop_table('rebalancing_buckets')
    op.drop_index(op.f('ix_categories_user_id'), table_name='categories')
    op.drop_table('categories')
    op.drop_table('users')
