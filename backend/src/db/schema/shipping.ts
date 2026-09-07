import {
  pgTable,
  varchar,
  text,
  timestamp,
  uuid,
  json,
} from 'drizzle-orm/pg-core';
import { pickLists } from './picking.js';

export const shippingManifests = pgTable('shipping_manifests', {
  awb_number: varchar('awb_number', { length: 50 }).primaryKey(),
  order_id: varchar('order_id', { length: 50 }),
  courier_partner: varchar('courier_partner', { length: 30 }),
  shipping_status: varchar('shipping_status', { length: 30 }).notNull().default('DISPATCHED'),
  item_payload: json('item_payload'),
  pick_list_id: uuid('pick_list_id').references(() => pickLists.id),
  processed_at: timestamp('processed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ShippingManifest = typeof shippingManifests.$inferSelect;
export type NewShippingManifest = typeof shippingManifests.$inferInsert;
