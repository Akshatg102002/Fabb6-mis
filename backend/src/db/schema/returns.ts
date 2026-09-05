import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  integer,
} from 'drizzle-orm/pg-core';
import { skus } from './catalogue.ts';
import { batches } from './inventory.ts';
import { users } from './auth.ts';

export const returnTypeEnum = pgEnum('return_type', ['customer_return', 'rto']);

export const returnStatusEnum = pgEnum('return_status', [
  'pending',
  'received',
  'inspected',
  'completed',
  'cancelled',
]);

export const qcGradeEnum = pgEnum('qc_grade', ['A', 'B', 'damaged', 'expired']);

export const dispositionEnum = pgEnum('disposition', ['restock', 'repack', 'writeoff']);

export const returns = pgTable('returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: returnTypeEnum('type').notNull(),
  order_ref: varchar('order_ref', { length: 100 }),
  received_at: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  courier_awb: varchar('courier_awb', { length: 100 }),
  status: returnStatusEnum('status').notNull().default('pending'),
  return_number: varchar('return_number', { length: 50 }).notNull().unique(),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const returnLines = pgTable('return_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  return_id: uuid('return_id')
    .notNull()
    .references(() => returns.id, { onDelete: 'cascade' }),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  batch_id: uuid('batch_id').references(() => batches.id),
  qty: integer('qty').notNull(),
  qc_grade: qcGradeEnum('qc_grade'),
  disposition: dispositionEnum('disposition'),
  inspected_by: uuid('inspected_by').references(() => users.id),
  inspected_at: timestamp('inspected_at', { withTimezone: true }),
  notes: text('notes'),
  line_number: integer('line_number').notNull(),
});

export type Return = typeof returns.$inferSelect;
export type NewReturn = typeof returns.$inferInsert;
export type ReturnLine = typeof returnLines.$inferSelect;
export type NewReturnLine = typeof returnLines.$inferInsert;
