/**
 * Core billing engine — pure computation over DB state. BullMQ jobs call
 * this function; admin routes can also call it synchronously for immediate
 * generation on small societies.
 */

import {
  bulkInsertBillLineItems,
  bulkInsertBills,
  deleteBillsByCycleId,
  findBillingCycleById,
  findPreviousBillingCycle,
  listActiveBillHeads,
  listBillsByCycleId,
  listMeterReadingsForPeriod,
  listUnits,
} from "@mysociety/db";
import type { Database } from "@mysociety/db";
import type { TaxRule } from "@mysociety/types";

function computeTax(amount: number, taxRule: TaxRule): number {
  if (taxRule.type === "percentage") return round2(amount * taxRule.rate / 100);
  if (taxRule.type === "fixed") return round2(taxRule.amount);
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SkippedUnit = { unitId: string; reason: string };

/**
 * Generates (or regenerates) all bills for a billing cycle. Idempotent when
 * the cycle is still in 'draft' status — existing bills are deleted and
 * recreated. Refuses to run if the cycle is 'published' or 'closed'.
 *
 * Must be called inside a tenant context (withTenantContext).
 */
export async function generateBillsForCycle(
  db: Database,
  societyId: string,
  cycleId: string,
): Promise<{ billsGenerated: number; skipped: SkippedUnit[] }> {
  const cycle = await findBillingCycleById(db, cycleId);
  if (!cycle) throw new Error(`Billing cycle ${cycleId} not found`);
  if (cycle.status !== "draft") {
    throw new Error(`Cannot regenerate bills for a cycle in '${cycle.status}' status`);
  }

  const [heads, allUnits, prevCycle] = await Promise.all([
    listActiveBillHeads(db),
    listUnits(db),
    findPreviousBillingCycle(db, cycle.period),
  ]);

  // Build meter-reading lookup: { headId -> { unitId -> consumedUnits } }
  const readingsByHead = new Map<string, Map<string, number>>();
  for (const head of heads) {
    if (head.computeRule !== "metered") continue;
    const readings = await listMeterReadingsForPeriod(db, head.id, cycle.period);
    const unitMap = new Map<string, number>();
    for (const r of readings) {
      unitMap.set(r.unitId, Math.max(0, r.currentReading - r.prevReading));
    }
    readingsByHead.set(head.id, unitMap);
  }

  // Build arrears lookup: { unitId -> outstanding amount }
  const arrearsMap = new Map<string, number>();
  if (prevCycle) {
    const prevBills = await listBillsByCycleId(db, prevCycle.id);
    for (const b of prevBills) {
      const outstanding = round2(b.totalDue - b.paidAmount);
      if (outstanding > 0) arrearsMap.set(b.unitId, outstanding);
    }
  }

  // Delete existing draft bills (cascade removes line items)
  await deleteBillsByCycleId(db, cycleId);

  // Compute bills in memory
  type BillSpec = {
    societyId: string;
    unitId: string;
    cycleId: string;
    dueDate: string;
    subtotal: number;
    taxTotal: number;
    arrearsCarryForward: number;
    totalDue: number;
  };
  type LineSpec = {
    societyId: string;
    billId: string;
    headId: string;
    description: string;
    qty: number;
    rate: number;
    amount: number;
    taxAmount: number;
  };

  const billSpecs: BillSpec[] = [];
  const lineSpecsByUnitIndex: Array<LineSpec[]> = [];
  const skipped: SkippedUnit[] = [];

  const allMetered = heads.length > 0 && heads.every((h) => h.computeRule === "metered");

  for (const unit of allUnits) {
    if (heads.length === 0) {
      skipped.push({ unitId: unit.id, reason: "no active bill heads" });
      continue;
    }

    const lineItems: Array<Omit<LineSpec, "billId" | "societyId">> = [];

    for (const head of heads) {
      let qty = 0;
      if (head.computeRule === "fixed" || head.computeRule === "flat_per_unit") {
        qty = 1;
      } else if (head.computeRule === "per_sqft") {
        qty = unit.carpetArea;
      } else if (head.computeRule === "metered") {
        qty = readingsByHead.get(head.id)?.get(unit.id) ?? 0;
        if (qty === 0) continue; // skip metered head when no reading
      }

      const amount = round2(qty * head.rate);
      const taxAmount = computeTax(amount, head.taxRule as TaxRule);
      lineItems.push({
        headId: head.id,
        description: head.name,
        qty,
        rate: head.rate,
        amount,
        taxAmount,
      });
    }

    if (allMetered && lineItems.length === 0) {
      skipped.push({ unitId: unit.id, reason: "no meter readings for this period" });
      continue;
    }

    const subtotal = round2(lineItems.reduce((s, l) => s + l.amount, 0));
    const taxTotal = round2(lineItems.reduce((s, l) => s + l.taxAmount, 0));
    const arrears = arrearsMap.get(unit.id) ?? 0;
    const totalDue = round2(subtotal + taxTotal + arrears);

    billSpecs.push({
      societyId,
      unitId: unit.id,
      cycleId,
      dueDate: cycle.dueDate,
      subtotal,
      taxTotal,
      arrearsCarryForward: arrears,
      totalDue,
    });
    lineSpecsByUnitIndex.push(
      lineItems.map((l) => ({ ...l, societyId, billId: "" })),
    );
  }

  // Bulk-insert bills, then bulk-insert all line items
  const insertedBills = await bulkInsertBills(db, billSpecs);

  const allLineSpecs: LineSpec[] = [];
  for (let i = 0; i < insertedBills.length; i++) {
    const bill = insertedBills[i]!;
    const lines = lineSpecsByUnitIndex[i]!;
    for (const l of lines) {
      allLineSpecs.push({ ...l, billId: bill.id });
    }
  }
  await bulkInsertBillLineItems(db, allLineSpecs);

  return { billsGenerated: insertedBills.length, skipped };
}
