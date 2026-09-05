import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
  integer,
  numeric,
} from 'drizzle-orm/pg-core';

export const abcClassEnum = pgEnum('abc_class', ['A', 'B', 'C']);
export const gtinSourceEnum = pgEnum('gtin_source', ['supplier', 'manual', 'shopify', 'scan']);

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  parent_id: uuid('parent_id'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skus = pgTable('skus', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  brand_id: uuid('brand_id').references(() => brands.id),
  category_id: uuid('category_id').references(() => categories.id),
  hsn_code: varchar('hsn_code', { length: 8 }),
  gst_rate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('18.00'),
  mrp: numeric('mrp', { precision: 12, scale: 2 }),
  standard_cost: numeric('standard_cost', { precision: 12, scale: 2 }),
  pack_size: integer('pack_size').notNull().default(1),
  uom: varchar('uom', { length: 20 }).notNull().default('EACH'),
  shelf_life_tracked: boolean('shelf_life_tracked').notNull().default(false),
  min_shelf_life_days: integer('min_shelf_life_days'),
  abc_class: abcClassEnum('abc_class').notNull().default('C'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gtins = pgTable('gtins', {
  id: uuid('id').primaryKey().defaultRandom(),
  barcode: varchar('barcode', { length: 50 }).notNull().unique(),
  sku_id: uuid('sku_id')
    .notNull()
    .references(() => skus.id),
  source: gtinSourceEnum('source').notNull().default('manual'),
  is_primary: boolean('is_primary').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  gstin: varchar('gstin', { length: 15 }),
  contact_name: varchar('contact_name', { length: 255 }),
  contact_phone: varchar('contact_phone', { length: 20 }),
  contact_email: varchar('contact_email', { length: 255 }),
  address: text('address'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Brand = typeof brands.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Sku = typeof skus.$inferSelect;
export type NewSku = typeof skus.$inferInsert;
export type Gtin = typeof gtins.$inferSelect;
export type NewGtin = typeof gtins.$inferInsert;
export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
