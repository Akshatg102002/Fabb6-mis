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
import { sites } from './locations.ts';

export const roleEnum = pgEnum('user_role', [
  'picker',
  'packer',
  'inward',
  'returns',
  'supervisor',
  'admin',
  'read_only',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  pin_hash: text('pin_hash').notNull(),
  role: roleEnum('role').notNull(),
  site_id: uuid('site_id').references(() => sites.id),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  device_id: varchar('device_id', { length: 255 }).notNull(),
  role: roleEnum('role').notNull(),
  site_id: uuid('site_id').references(() => sites.id),
  token_hash: text('token_hash').notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  ip_address: varchar('ip_address', { length: 45 }),
  user_agent: text('user_agent'),
  ttl_seconds: integer('ttl_seconds').notNull().default(28800),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type UserRole = (typeof roleEnum.enumValues)[number];
