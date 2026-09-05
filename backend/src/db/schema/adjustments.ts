import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  integer,
  numeric,
} from 'drizzle-orm/pg-core';
import { skus } from './catalogue.js';
import { locations } from './locations.js';
import { batches } from './inventory.js';
import { users } from './auth.js';

export const adjustmentStatusEnum = pgEnum('adjustment_status', [
  'pending',
  'approved',
  'rejected',
  'posted',
]);

export const adjustments = pgTable('adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  batch_id: uuid('batch_id').references(() => batches.id),
  location_id: uuid('location_id')
    .notNull()
    .references(() => locations.id),
  quantity: integer('quantity').notNull(),
  reason_code: varchar('reason_code', { length: 50 }).notNull(),
  reason_notes: varchar('reason_notes', { length: 500 }),
  status: adjustmentStatusEnum('status').notNull().default('pending'),
  requested_by: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  approved_by: uuid('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  rejected_at: timestamp('rejected_at', { withTimezone: true }),
  rejection_reason: varchar('rejection_reason', { length: 500 }),
  value_impact: numeric('value_impact', { precision: 14, scale: 2 }),
  adjustment_number: varchar('adjustment_number', { length: 50 }).notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Adjustment = typeof adjustments.$inferSelect;
export type NewAdjustment = typeof adjustments.$inferInsert;
