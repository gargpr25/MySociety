import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { auditLog, bills, gatewayEvents, paymentAllocations, payments, societyBankAccounts } from "../schema.js";

// ── Audit Log ──────────────────────────────────────────────────────────────────

export type AuditLogRow = typeof auditLog.$inferSelect;

export async function insertAuditLog(
  db: Database,
  input: {
    societyId?: string;
    actorId?: string;
    actorKind: "admin" | "resident" | "system";
    action: string;
    entityType: string;
    entityId?: string;
    beforeState?: unknown;
    afterState?: unknown;
    ipAddress?: string;
  },
) {
  const [row] = await db
    .insert(auditLog)
    .values({
      societyId: input.societyId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      ipAddress: input.ipAddress,
    })
    .returning();
  return row;
}

export async function listAuditLog(db: Database, societyId: string, limit = 100) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.societyId, societyId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

// ── Society Bank Accounts ──────────────────────────────────────────────────────

export type BankAccountRow = typeof societyBankAccounts.$inferSelect;

export async function createBankAccount(
  db: Database,
  input: {
    societyId: string;
    accountName: string;
    accountNumberLast4: string;
    accountNumberEncrypted: string;
    ifsc: string;
    bankName: string;
    createdBy: string;
  },
) {
  const [row] = await db.insert(societyBankAccounts).values(input).returning();
  return row;
}

export async function listBankAccounts(db: Database) {
  return db.select().from(societyBankAccounts).orderBy(desc(societyBankAccounts.createdAt));
}

export async function findBankAccountById(db: Database, id: string) {
  const [row] = await db.select().from(societyBankAccounts).where(eq(societyBankAccounts.id, id));
  return row;
}

export async function updateBankAccountStatus(
  db: Database,
  id: string,
  input: {
    status: string;
    razorpayLinkedAccountId?: string;
    approvedBy?: string;
    approvedAt?: Date;
    rejectionReason?: string;
  },
) {
  const [row] = await db
    .update(societyBankAccounts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(societyBankAccounts.id, id))
    .returning();
  return row;
}

// ── Gateway Events ─────────────────────────────────────────────────────────────

export type GatewayEventRow = typeof gatewayEvents.$inferSelect;

export async function upsertGatewayEvent(
  db: Database,
  input: { provider: string; eventId: string; eventType: string; payload: unknown },
): Promise<{ row: GatewayEventRow; alreadyProcessed: boolean }> {
  const existing = await db
    .select()
    .from(gatewayEvents)
    .where(and(eq(gatewayEvents.provider, input.provider), eq(gatewayEvents.eventId, input.eventId)));

  if (existing[0]) {
    return { row: existing[0], alreadyProcessed: existing[0].processedAt !== null };
  }

  const [row] = await db
    .insert(gatewayEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      eventType: input.eventType,
      payload: input.payload as Record<string, unknown>,
    })
    .returning();
  return { row: row!, alreadyProcessed: false };
}

export async function markGatewayEventProcessed(db: Database, id: string) {
  await db.update(gatewayEvents).set({ processedAt: new Date() }).where(eq(gatewayEvents.id, id));
}

// ── Payments ───────────────────────────────────────────────────────────────────

export type PaymentRow = typeof payments.$inferSelect;

export async function createPayment(
  db: Database,
  input: {
    societyId: string;
    residentId: string;
    provider: string;
    providerOrderId: string;
    amountPaise: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(payments)
    .values({
      societyId: input.societyId,
      residentId: input.residentId,
      provider: input.provider,
      providerOrderId: input.providerOrderId,
      amountPaise: input.amountPaise,
      currency: input.currency ?? "INR",
      metadata: input.metadata ?? {},
    })
    .returning();
  return row;
}

export async function findPaymentByProviderOrderId(db: Database, providerOrderId: string) {
  const [row] = await db.select().from(payments).where(eq(payments.providerOrderId, providerOrderId));
  return row;
}

export async function findPaymentById(db: Database, id: string) {
  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  return row;
}

export async function updatePaymentCaptured(
  db: Database,
  id: string,
  providerPaymentId: string,
) {
  const [row] = await db
    .update(payments)
    .set({ status: "captured", providerPaymentId, updatedAt: new Date() })
    .where(eq(payments.id, id))
    .returning();
  return row;
}

export async function updatePaymentFailed(db: Database, id: string) {
  const [row] = await db
    .update(payments)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(payments.id, id))
    .returning();
  return row;
}

export async function listPendingPaymentsOlderThan(db: Database, cutoff: Date) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.status, "pending"), lt(payments.createdAt, cutoff)));
}

export async function listPaymentsBySociety(db: Database, limit = 200) {
  return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(limit);
}

export async function listPaymentsByResident(db: Database, residentId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.residentId, residentId))
    .orderBy(desc(payments.createdAt));
}

// ── Payment Allocations ────────────────────────────────────────────────────────

export type PaymentAllocationRow = typeof paymentAllocations.$inferSelect;

export async function createPaymentAllocations(
  db: Database,
  rows: { societyId: string; paymentId: string; billId: string; amountPaise: number }[],
) {
  if (rows.length === 0) return [];
  return db.insert(paymentAllocations).values(rows).returning();
}

export async function listAllocationsByPaymentId(db: Database, paymentId: string) {
  return db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
}

export async function listAllocationsByBillId(db: Database, billId: string) {
  return db.select().from(paymentAllocations).where(eq(paymentAllocations.billId, billId));
}

export async function sumAllocationsForBills(db: Database, billIds: string[]): Promise<Map<string, number>> {
  if (billIds.length === 0) return new Map();
  const rows = await db
    .select({
      billId: paymentAllocations.billId,
      total: sql<string>`sum(${paymentAllocations.amountPaise})`,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.billId, billIds))
    .groupBy(paymentAllocations.billId);

  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.billId, Number(r.total));
  }
  return map;
}

// ── Bill update helper (called after payment captured) ─────────────────────────

export async function applyPaymentToBill(
  db: Database,
  billId: string,
  paidPaise: number,
) {
  const [bill] = await db.select().from(bills).where(eq(bills.id, billId));
  if (!bill) return;

  const newPaidAmount = bill.paidAmount + paidPaise / 100;
  const totalDue = bill.totalDue;
  let newStatus: string;
  if (newPaidAmount >= totalDue) {
    newStatus = "paid";
  } else if (newPaidAmount > 0) {
    newStatus = "partial";
  } else {
    newStatus = bill.status;
  }

  await db
    .update(bills)
    .set({ paidAmount: newPaidAmount, status: newStatus, updatedAt: new Date() })
    .where(eq(bills.id, billId));
}
