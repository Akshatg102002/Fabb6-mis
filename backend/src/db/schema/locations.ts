import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
  integer,
} from 'drizzle-orm/pg-core';

export const locationTypeEnum = pgEnum('location_type', [
  'receiving',
  'bin',
  'pick_face',
  'quarantine',
  'dispatch',
  'returns',
]);

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  gstin: varchar('gstin', { length: 15 }),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  site_id: uuid('site_id')
    .notNull()
    .references(() => sites.id),
  code: varchar('code', { length: 50 }).notNull().unique(),
  type: locationTypeEnum('type').notNull(),
  aisle: varchar('aisle', { length: 10 }),
  rack: varchar('rack', { length: 10 }),
  shelf: varchar('shelf', { length: 10 }),
  position: varchar('position', { length: 10 }),
  capacity_units: integer('capacity_units'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type LocationType = (typeof locationTypeEnum.enumValues)[number];
