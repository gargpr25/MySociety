import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const societies = pgTable("societies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: jsonb("address").notNull().default({}),
  config: jsonb("config").notNull().default({}),
  onboardingStatus: text("onboarding_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const towers = pgTable("towers", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  name: text("name").notNull(),
});

export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  towerId: uuid("tower_id").notNull(),
  flatNo: text("flat_no").notNull(),
  type: text("type").notNull(),
  carpetArea: numeric("carpet_area", { mode: "number" }).notNull(),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
});

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").notNull(),
  permissionId: uuid("permission_id").notNull(),
});

export const residents = pgTable("residents", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  unitId: uuid("unit_id"),
  roleId: uuid("role_id").notNull(),
  name: text("name").notNull(),
  mobile: text("mobile").notNull(),
  canPay: boolean("can_pay").notNull().default(true),
  isPrimary: boolean("is_primary").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id"),
  roleId: uuid("role_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const unitResidents = pgTable("unit_residents", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  unitId: uuid("unit_id").notNull(),
  residentId: uuid("resident_id").notNull(),
  relationship: text("relationship").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  canPay: boolean("can_pay").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parkingSpots = pgTable("parking_spots", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  spotNo: text("spot_no").notNull(),
  type: text("type").notNull().default("car"),
  unitId: uuid("unit_id"),
  isRentable: boolean("is_rentable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpRequests = pgTable("otp_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  purpose: text("purpose").notNull(),
  identifier: text("identifier").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
