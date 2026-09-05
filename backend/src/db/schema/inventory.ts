import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  integer,
  bigint,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { skus } from './catalogue.ts';
import { locations } from './locations.ts';
import { users } from './auth.ts';

export const movementTypeEnum = pgEnum('movement_type', [
  'grn_receipt',
  'putaway',
  'pick',
  'pack_confirm',
  'dispatch',
  'customer_return',
  'rto_receipt',
  'transfer_out',
  'transfer_in_transit',
  'transfer_receipt',
  'cycle_count_adjustment',
  'stock_adjustment',
  'writeoff',
  'quarantine',
  'unquarantine',
]);

export const referenceTypeEnum = pgEnum('reference_type', [
  'grn',
  'pick_list',
  'return',
  'cycle_count',
  'adjustment',
  'transfer',
  'purchase_order',
  'manual',
]);

export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  batch_number: varchar('batch_number', { length: 100 }).notNull(),
  mfg_date: timestamp('mfg_date', { withTimezone: true }),
  expiry_date: timestamp('expiry_date', { withTimezone: true }),
  landed_cost_per_unit: varchar('landed_cost_per_unit', { length: 20 }),
  supplier_id: uuid('supplier_id'),
  grn_id: uuid('grn_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    idempotency_key: varchar('idempotency_key', { length: 128 }).notNull().unique(),
    sku_id: uuid('sku_id')
      .notNull()
      .references(() => skus.id),
    batch_id: uuid('batch_id').references(() => batches.id),
    from_location_id: uuid('from_location_id').references(() => locations.id),
    to_location_id: uuid('to_location_id').references(() => locations.id),
    quantity: integer('quantity').notNull(),
    movement_type: movementTypeEnum('movement_type').notNull(),
    reference_type: referenceTypeEnum('reference_type'),
    reference_id: uuid('reference_id'),
    reason_code: varchar('reason_code', { length: 50 }),
    user_id: uuid('user_id').references(() => users.id),
    device_id: varchar('device_id', { length: 255 }),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('stock_movements_idempotency_key_idx').on(table.idempotency_key)],
);

// Note: stock_on_hand is a materialized view created in the SQL migration
// It cannot be represented as a Drizzle table definition but is queried via raw SQL

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type MovementType = (typeof movementTypeEnum.enumValues)[number];
export type ReferenceType = (typeof referenceTypeEnum.enumValues)[number];
