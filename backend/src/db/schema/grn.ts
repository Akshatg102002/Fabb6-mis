import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  integer,
  numeric,
} from 'drizzle-orm/pg-core';
import { skus, suppliers } from './catalogue.ts';
import { sites } from './locations.ts';
import { batches } from './inventory.ts';
import { users } from './auth.ts';

export const poStatusEnum = pgEnum('po_status', [
  'draft',
  'confirmed',
  'partial',
  'received',
  'cancelled',
]);

export const grnStatusEnum = pgEnum('grn_status', [
  'draft',
  'in_progress',
  'completed',
  'posted',
]);

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplier_id: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  site_id: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  po_number: varchar('po_number', { length: 50 }).notNull().unique(),
  status: poStatusEnum('status').notNull().default('draft'),
  expected_date: timestamp('expected_date', { withTimezone: true }),
  total_value: numeric('total_value', { precision: 14, scale: 2 }),
  notes: text('notes'),
  created_by: uuid('created_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const poLines = pgTable('po_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  po_id: uuid('po_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  ordered_qty: integer('ordered_qty').notNull(),
  received_qty: integer('received_qty').notNull().default(0),
  unit_cost: numeric('unit_cost', { precision: 12, scale: 2 }),
  line_number: integer('line_number').notNull(),
});

export const grns = pgTable('grns', {
  id: uuid('id').primaryKey().defaultRandom(),
  po_id: uuid('po_id').references(() => purchaseOrders.id),
  supplier_invoice_no: varchar('supplier_invoice_no', { length: 100 }),
  received_at: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  received_by: uuid('received_by')
    .notNull()
    .references(() => users.id),
  site_id: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  status: grnStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  grn_number: varchar('grn_number', { length: 50 }).notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const grnLines = pgTable('grn_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  grn_id: uuid('grn_id')
    .notNull()
    .references(() => grns.id, { onDelete: 'cascade' }),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  batch_id: uuid('batch_id').references(() => batches.id),
  qty_received: integer('qty_received').notNull(),
  qty_accepted: integer('qty_accepted').notNull(),
  qty_rejected: integer('qty_rejected').notNull().default(0),
  rejection_reason: text('rejection_reason'),
  unit_cost: numeric('unit_cost', { precision: 12, scale: 2 }),
  line_number: integer('line_number').notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PoLine = typeof poLines.$inferSelect;
export type NewPoLine = typeof poLines.$inferInsert;
export type Grn = typeof grns.$inferSelect;
export type NewGrn = typeof grns.$inferInsert;
export type GrnLine = typeof grnLines.$inferSelect;
export type NewGrnLine = typeof grnLines.$inferInsert;
