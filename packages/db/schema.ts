import { pgTable, uuid, text, jsonb, timestamp, integer, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';

export const societies = pgTable('societies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: jsonb('address'),
  config: jsonb('config'),
  onboarding_status: text('onboarding_status'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const towers = pgTable('towers', {
  id: uuid('id').primaryKey().defaultRandom(),
  society_id: uuid('society_id').references(() => societies.id).notNull(),
  name: text('name').notNull(),
}, (table) => [
  pgPolicy("towers_isolation_policy", {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`society_id = (current_setting('app.current_society_id'))::uuid`,
    withCheck: sql`society_id = (current_setting('app.current_society_id'))::uuid`
  })
]).enableRLS();

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  society_id: uuid('society_id').references(() => societies.id).notNull(),
  tower_id: uuid('tower_id').references(() => towers.id).notNull(),
  flat_no: text('flat_no').notNull(),
  type: text('type'),
  carpet_area: numeric('carpet_area'),
}, (table) => [
  pgPolicy("units_isolation_policy", {
    as: "permissive",
    for: "all",
    to: "public",
    using: sql`society_id = (current_setting('app.current_society_id'))::uuid`,
    withCheck: sql`society_id = (current_setting('app.current_society_id'))::uuid`
  })
]).enableRLS();
