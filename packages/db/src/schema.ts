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

export const billHeads = pgTable("bill_heads", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  name: text("name").notNull(),
  computeRule: text("compute_rule").notNull(),
  rate: numeric("rate", { mode: "number" }).notNull().default(0),
  taxRule: jsonb("tax_rule").notNull().default({ type: "none" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const meterReadings = pgTable("meter_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  unitId: uuid("unit_id").notNull(),
  headId: uuid("head_id").notNull(),
  period: text("period").notNull(),
  prevReading: numeric("prev_reading", { mode: "number" }).notNull().default(0),
  currentReading: numeric("current_reading", { mode: "number" }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingCycles = pgTable("billing_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  period: text("period").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("draft"),
  lateFeeRule: jsonb("late_fee_rule").notNull().default({ type: "none" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bills = pgTable("bills", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  unitId: uuid("unit_id").notNull(),
  cycleId: uuid("cycle_id").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("unpaid"),
  subtotal: numeric("subtotal", { mode: "number" }).notNull().default(0),
  taxTotal: numeric("tax_total", { mode: "number" }).notNull().default(0),
  arrearsCarryForward: numeric("arrears_carry_forward", { mode: "number" }).notNull().default(0),
  totalDue: numeric("total_due", { mode: "number" }).notNull().default(0),
  paidAmount: numeric("paid_amount", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billLineItems = pgTable("bill_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  billId: uuid("bill_id").notNull(),
  headId: uuid("head_id").notNull(),
  description: text("description").notNull(),
  qty: numeric("qty", { mode: "number" }).notNull().default(1),
  rate: numeric("rate", { mode: "number" }).notNull().default(0),
  amount: numeric("amount", { mode: "number" }).notNull().default(0),
  taxAmount: numeric("tax_amount", { mode: "number" }).notNull().default(0),
});

export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull().default("all"),
  pinned: boolean("pinned").notNull().default(false),
  publishAt: timestamp("publish_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
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
