import { bigint, boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const societies = pgTable("societies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: jsonb("address").notNull().default({}),
  config: jsonb("config").notNull().default({}),
  onboardingStatus: text("onboarding_status").notNull().default("pending"),
  razorpayLinkedAccountId: text("razorpay_linked_account_id"),
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

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id"),
  actorId: uuid("actor_id"),
  actorKind: text("actor_kind").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const societyBankAccounts = pgTable("society_bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  accountName: text("account_name").notNull(),
  accountNumberLast4: text("account_number_last4").notNull(),
  accountNumberEncrypted: text("account_number_encrypted").notNull(),
  ifsc: text("ifsc").notNull(),
  bankName: text("bank_name").notNull().default(""),
  status: text("status").notNull().default("pending_verification"),
  razorpayLinkedAccountId: text("razorpay_linked_account_id"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  residentId: uuid("resident_id").notNull(),
  provider: text("provider").notNull().default("fake"),
  providerOrderId: text("provider_order_id").notNull(),
  providerPaymentId: text("provider_payment_id"),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentAllocations = pgTable("payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  paymentId: uuid("payment_id").notNull(),
  billId: uuid("bill_id").notNull(),
  amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookableResources = pgTable("bookable_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  capacity: integer("capacity").notNull().default(1),
  slotRules: jsonb("slot_rules").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  resourceId: uuid("resource_id").notNull(),
  unitId: uuid("unit_id").notNull(),
  bookedBy: uuid("booked_by").notNull(),
  slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
  slotEnd: timestamp("slot_end", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parkingAllocations = pgTable("parking_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  spotId: uuid("spot_id").notNull(),
  unitId: uuid("unit_id").notNull(),
  period: text("period").notNull(),
  rentAmount: numeric("rent_amount", { mode: "number" }).notNull().default(0),
  billId: uuid("bill_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  unitId: uuid("unit_id"),
  raisedBy: uuid("raised_by").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  assignedTo: uuid("assigned_to"),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  slaBreached: boolean("sla_breached").notNull().default(false),
  channel: text("channel").notNull().default("app"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketEvents = pgTable("ticket_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  societyId: uuid("society_id").notNull(),
  ticketId: uuid("ticket_id").notNull(),
  actorId: uuid("actor_id"),
  actorKind: text("actor_kind").notNull(),
  eventType: text("event_type").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gatewayEvents = pgTable("gateway_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
