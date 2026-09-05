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
import { sites, locations } from './locations.ts';
import { batches } from './inventory.ts';
import { users } from './auth.ts';

export const pickListStatusEnum = pgEnum('pick_list_status', [
  'pending',
  'assigned',
  'in_progress',
  'partially_picked',
  'picked',
  'packed',
  'dispatched',
  'cancelled',
]);

export const pickChannelEnum = pgEnum('pick_channel', [
  'shopify',
  'b2b',
  'transfer',
  'manual',
]);

export const pickLists = pgTable('pick_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  site_id: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  wave_id: uuid('wave_id'),
  status: pickListStatusEnum('status').notNull().default('pending'),
  assigned_to: uuid('assigned_to').references(() => users.id),
  channel: pickChannelEnum('channel').notNull().default('shopify'),
  priority: integer('priority').notNull().default(0),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export const pickLines = pgTable('pick_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  pick_list_id: uuid('pick_list_id')
    .notNull()
    .references(() => pickLists.id, { onDelete: 'cascade' }),
  order_ref: varchar('order_ref', { length: 100 }).notNull(),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  batch_id: uuid('batch_id').references(() => batches.id),
  location_id: uuid('location_id').references(() => locations.id),
  qty_required: integer('qty_required').notNull(),
  qty_picked: integer('qty_picked').notNull().default(0),
  picked_at: timestamp('picked_at', { withTimezone: true }),
  picked_by: uuid('picked_by').references(() => users.id),
  line_number: integer('line_number').notNull(),
  sort_sequence: integer('sort_sequence').notNull().default(0),
});

export type PickList = typeof pickLists.$inferSelect;
export type NewPickList = typeof pickLists.$inferInsert;
export type PickLine = typeof pickLines.$inferSelect;
export type NewPickLine = typeof pickLines.$inferInsert;
