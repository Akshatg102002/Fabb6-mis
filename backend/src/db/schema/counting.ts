import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  integer,
  numeric,
} from 'drizzle-orm/pg-core';
import { skus } from './catalogue.ts';
import { sites, locations } from './locations.ts';
import { batches } from './inventory.ts';
import { users } from './auth.ts';

export const cycleCountStatusEnum = pgEnum('cycle_count_status', [
  'scheduled',
  'in_progress',
  'counted',
  'under_review',
  'approved',
  'posted',
  'cancelled',
]);

export const cycleCounts = pgTable('cycle_counts', {
  id: uuid('id').primaryKey().defaultRandom(),
  site_id: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  location_id: uuid('location_id').references(() => locations.id),
  status: cycleCountStatusEnum('status').notNull().default('scheduled'),
  scheduled_for: timestamp('scheduled_for', { withTimezone: true }),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  counted_by: uuid('counted_by').references(() => users.id),
  variance_value: numeric('variance_value', { precision: 14, scale: 2 }),
  approved_by: uuid('approved_by').references(() => users.id),
  approved_at: timestamp('approved_at', { withTimezone: true }),
  count_number: varchar('count_number', { length: 50 }).notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cycleCountLines = pgTable('cycle_count_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  cycle_count_id: uuid('cycle_count_id')
    .notNull()
    .references(() => cycleCounts.id, { onDelete: 'cascade' }),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  batch_id: uuid('batch_id').references(() => batches.id),
  system_qty: integer('system_qty').notNull().default(0),
  counted_qty: integer('counted_qty'),
  variance: integer('variance'),
  line_number: integer('line_number').notNull(),
  counted_at: timestamp('counted_at', { withTimezone: true }),
});

export type CycleCount = typeof cycleCounts.$inferSelect;
export type NewCycleCount = typeof cycleCounts.$inferInsert;
export type CycleCountLine = typeof cycleCountLines.$inferSelect;
export type NewCycleCountLine = typeof cycleCountLines.$inferInsert;
