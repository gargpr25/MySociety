import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { billHeads, billLineItems, billingCycles, bills, meterReadings } from "../schema.js";

// ── Bill Heads ─────────────────────────────────────────────────────────────────

export type BillHeadRow = typeof billHeads.$inferSelect;
export type CreateBillHeadInput = {
  societyId: string;
  name: string;
  computeRule: string;
  rate: number;
  taxRule?: object;
};

export async function createBillHead(db: Database, input: CreateBillHeadInput) {
  const [row] = await db
    .insert(billHeads)
    .values({
      societyId: input.societyId,
      name: input.name,
      computeRule: input.computeRule,
      rate: input.rate,
      taxRule: input.taxRule ?? { type: "none" },
    })
    .returning();
  return row;
}

export async function listBillHeads(db: Database) {
  return db.select().from(billHeads).orderBy(asc(billHeads.name));
}

export async function listActiveBillHeads(db: Database) {
  return db.select().from(billHeads).where(eq(billHeads.isActive, true)).orderBy(asc(billHeads.name));
}

export async function findBillHeadById(db: Database, id: string) {
  const [row] = await db.select().from(billHeads).where(eq(billHeads.id, id));
  return row;
}

export async function updateBillHead(
  db: Database,
  id: string,
  input: Partial<{ name: string; computeRule: string; rate: number; taxRule: object; isActive: boolean }>,
) {
  const [row] = await db
    .update(billHeads)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(billHeads.id, id))
    .returning();
  return row;
}

export async function deleteBillHead(db: Database, id: string) {
  await db.delete(billHeads).where(eq(billHeads.id, id));
}

// ── Meter Readings ─────────────────────────────────────────────────────────────

export async function upsertMeterReading(
  db: Database,
  input: { societyId: string; unitId: string; headId: string; period: string; prevReading: number; currentReading: number },
) {
  const [row] = await db
    .insert(meterReadings)
    .values(input)
    .onConflictDoUpdate({
      target: [meterReadings.unitId, meterReadings.headId, meterReadings.period],
      set: { prevReading: input.prevReading, currentReading: input.currentReading },
    })
    .returning();
  return row;
}

export async function listMeterReadingsForPeriod(db: Database, headId: string, period: string) {
  return db
    .select()
    .from(meterReadings)
    .where(and(eq(meterReadings.headId, headId), eq(meterReadings.period, period)));
}

export async function bulkUpsertMeterReadings(
  db: Database,
  rows: Array<{ societyId: string; unitId: string; headId: string; period: string; prevReading: number; currentReading: number }>,
) {
  if (rows.length === 0) return;
  await db
    .insert(meterReadings)
    .values(rows)
    .onConflictDoUpdate({
      target: [meterReadings.unitId, meterReadings.headId, meterReadings.period],
      set: {
        prevReading: sql`excluded.prev_reading`,
        currentReading: sql`excluded.current_reading`,
      },
    });
}

// ── Billing Cycles ─────────────────────────────────────────────────────────────

export type BillingCycleRow = typeof billingCycles.$inferSelect;

export async function createBillingCycle(
  db: Database,
  input: { societyId: string; period: string; dueDate: string; lateFeeRule?: object },
) {
  const [row] = await db
    .insert(billingCycles)
    .values({
      societyId: input.societyId,
      period: input.period,
      dueDate: input.dueDate,
      lateFeeRule: input.lateFeeRule ?? { type: "none" },
    })
    .returning();
  return row;
}

export async function findBillingCycleById(db: Database, id: string) {
  const [row] = await db.select().from(billingCycles).where(eq(billingCycles.id, id));
  return row;
}

export async function findBillingCycleByPeriod(db: Database, period: string) {
  const [row] = await db.select().from(billingCycles).where(eq(billingCycles.period, period));
  return row;
}

export async function listBillingCycles(db: Database) {
  return db.select().from(billingCycles).orderBy(desc(billingCycles.period));
}

export async function findPreviousBillingCycle(db: Database, period: string) {
  const [row] = await db
    .select()
    .from(billingCycles)
    .where(lt(billingCycles.period, period))
    .orderBy(desc(billingCycles.period))
    .limit(1);
  return row;
}

export async function updateBillingCycleStatus(db: Database, id: string, status: string) {
  const [row] = await db
    .update(billingCycles)
    .set({ status, updatedAt: new Date() })
    .where(eq(billingCycles.id, id))
    .returning();
  return row;
}

// ── Bills ──────────────────────────────────────────────────────────────────────

export type BillRow = typeof bills.$inferSelect;

export async function findBillById(db: Database, id: string) {
  const [row] = await db.select().from(bills).where(eq(bills.id, id));
  return row;
}

export async function findBillByUnitAndCycle(db: Database, unitId: string, cycleId: string) {
  const [row] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.unitId, unitId), eq(bills.cycleId, cycleId)));
  return row;
}

export async function listBillsByCycleId(db: Database, cycleId: string) {
  return db.select().from(bills).where(eq(bills.cycleId, cycleId));
}

export async function listBillsByUnitId(db: Database, unitId: string) {
  return db.select().from(bills).where(eq(bills.unitId, unitId)).orderBy(desc(bills.dueDate));
}

export async function deleteBillsByCycleId(db: Database, cycleId: string) {
  await db.delete(bills).where(eq(bills.cycleId, cycleId));
}

export async function bulkInsertBills(
  db: Database,
  rows: Array<{
    societyId: string;
    unitId: string;
    cycleId: string;
    dueDate: string;
    subtotal: number;
    taxTotal: number;
    arrearsCarryForward: number;
    totalDue: number;
  }>,
) {
  if (rows.length === 0) return [];
  return db
    .insert(bills)
    .values(rows.map((r) => ({ ...r, status: "unpaid", paidAmount: 0 })))
    .returning();
}

export async function updateBillStatusAndPaid(
  db: Database,
  id: string,
  paidAmount: number,
  status: string,
) {
  const [row] = await db
    .update(bills)
    .set({ paidAmount, status, updatedAt: new Date() })
    .where(eq(bills.id, id))
    .returning();
  return row;
}

export async function markOverdueBills(db: Database, dueBefore: string) {
  await db
    .update(bills)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(bills.status, "unpaid"),
        lt(bills.dueDate, dueBefore),
      ),
    );
}

// ── Bill Line Items ────────────────────────────────────────────────────────────

export type BillLineItemRow = typeof billLineItems.$inferSelect;

export async function listLineItemsByBillId(db: Database, billId: string) {
  return db.select().from(billLineItems).where(eq(billLineItems.billId, billId));
}

export async function bulkInsertBillLineItems(
  db: Database,
  rows: Array<{
    societyId: string;
    billId: string;
    headId: string;
    description: string;
    qty: number;
    rate: number;
    amount: number;
    taxAmount: number;
  }>,
) {
  if (rows.length === 0) return;
  await db.insert(billLineItems).values(rows);
}

// ── Collection summary (admin dashboard) ─────────────────────────────────────

export async function getCollectionSummary(db: Database, cycleId: string) {
  const rows = await db
    .select({
      status: bills.status,
      count: sql<number>`count(*)::int`,
      totalDue: sql<number>`sum(${bills.totalDue})::numeric`,
      paidAmount: sql<number>`sum(${bills.paidAmount})::numeric`,
    })
    .from(bills)
    .where(eq(bills.cycleId, cycleId))
    .groupBy(bills.status);

  const result = { paid: 0, partial: 0, overdue: 0, unpaid: 0, totalBills: 0, totalDue: 0, totalCollected: 0 };
  for (const r of rows) {
    const count = r.count;
    const due = Number(r.totalDue ?? 0);
    const collected = Number(r.paidAmount ?? 0);
    result.totalBills += count;
    result.totalDue += due;
    result.totalCollected += collected;
    if (r.status === "paid") result.paid += count;
    else if (r.status === "partial") result.partial += count;
    else if (r.status === "overdue") result.overdue += count;
    else result.unpaid += count;
  }
  return result;
}
