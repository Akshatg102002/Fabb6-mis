import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  bigint,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    user_id: uuid('user_id').references(() => users.id),
    entity: varchar('entity', { length: 100 }).notNull(),
    entity_id: varchar('entity_id', { length: 255 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    ip_address: varchar('ip_address', { length: 45 }),
    device_id: varchar('device_id', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_entity_idx').on(table.entity, table.entity_id),
    index('audit_log_user_idx').on(table.user_id),
    index('audit_log_created_at_idx').on(table.created_at),
  ],
);

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  user_id: uuid('user_id').references(() => users.id),
  request_path: varchar('request_path', { length: 500 }).notNull(),
  request_body_hash: varchar('request_body_hash', { length: 64 }).notNull(),
  response_status: varchar('response_status', { length: 3 }).notNull(),
  response_body: jsonb('response_body').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
