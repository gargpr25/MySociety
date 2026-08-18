import type { FastifyInstance } from "fastify";
import {
  findBillById,
  findBillingCycleById,
  findSocietyById,
  findUnitById,
  listLineItemsByBillId,
  listPublishedBillsByUnitIds,
  listUnitIdsForResident,
} from "@mysociety/db";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import { generateInvoicePdf } from "../billing/invoice-pdf.js";

export interface ResidentBillingRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
}

const RESIDENT_ROLES = ["resident_owner", "resident_tenant", "resident_family"] as const;

export function registerResidentBillingRoutes(app: FastifyInstance, options: ResidentBillingRouteOptions) {
  const preHandler = [authenticate(options.jwtSecret), requireRole(...RESIDENT_ROLES)];

  // List own bills (across all cycles, ordered by due date desc)
  app.get("/resident/bills", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    const residentId = request.principal?.id;
    if (!societyId || !residentId) return reply.code(400).send({ error: "Not scoped" });

    const unitIds = await options.tenantDb.withTenant(societyId, (db) =>
      listUnitIdsForResident(db, residentId),
    );
    if (unitIds.length === 0) return reply.send([]);

    const bills = await options.tenantDb.withTenant(societyId, (db) =>
      listPublishedBillsByUnitIds(db, unitIds),
    );
    return reply.send(bills.map(serializeBill));
  });

  // Bill detail with line items
  app.get("/resident/bills/:id", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    const residentId = request.principal?.id;
    if (!societyId || !residentId) return reply.code(400).send({ error: "Not scoped" });

    const { id: billId } = request.params as { id: string };

    const bill = await options.tenantDb.withTenant(societyId, (db) => findBillById(db, billId));
    if (!bill) return reply.code(404).send({ error: "Bill not found" });

    if (!(await residentMayReadBill(options, societyId, residentId, bill))) {
      return reply.code(404).send({ error: "Bill not found" });
    }

    const lineItems = await options.tenantDb.withTenant(societyId, (db) =>
      listLineItemsByBillId(db, billId),
    );

    return reply.send({
      ...serializeBill(bill),
      lineItems: lineItems.map(serializeLineItem),
    });
  });

  // Download PDF invoice
  app.get("/resident/bills/:id/invoice.pdf", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    const residentId = request.principal?.id;
    if (!societyId || !residentId) return reply.code(400).send({ error: "Not scoped" });

    const { id: billId } = request.params as { id: string };

    const bill = await options.tenantDb.withTenant(societyId, (db) => findBillById(db, billId));
    if (!bill) return reply.code(404).send({ error: "Bill not found" });

    if (!(await residentMayReadBill(options, societyId, residentId, bill))) {
      return reply.code(404).send({ error: "Bill not found" });
    }

    const [lineItems, cycle, unit, society] = await options.tenantDb.withTenant(
      societyId,
      async (db) => {
        const li = await listLineItemsByBillId(db, billId);
        const cy = await findBillingCycleById(db, bill.cycleId);
        const u = await findUnitById(db, bill.unitId);
        const s = await findSocietyById(db, societyId);
        return [li, cy, u, s] as const;
      },
    );

    const pdfBytes = await generateInvoicePdf({
      societyName: society?.name ?? `Society ${societyId.slice(0, 8)}`,
      flatNo: unit?.flatNo ?? bill.unitId,
      period: cycle?.period ?? bill.cycleId,
      dueDate: bill.dueDate,
      lineItems: lineItems.map((li) => ({
        description: li.description,
        qty: Number(li.qty),
        rate: Number(li.rate),
        amount: Number(li.amount),
        taxAmount: Number(li.taxAmount),
      })),
      subtotal: Number(bill.subtotal),
      taxTotal: Number(bill.taxTotal),
      arrearsCarryForward: Number(bill.arrearsCarryForward),
      totalDue: Number(bill.totalDue),
      paidAmount: Number(bill.paidAmount),
      status: bill.status,
    });

    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `attachment; filename="invoice-${billId}.pdf"`);
    return reply.send(Buffer.from(pdfBytes));
  });
}

/**
 * A resident may read a bill of a flat they are linked to, once the cycle it
 * belongs to has left draft.
 */
async function residentMayReadBill(
  options: ResidentBillingRouteOptions,
  societyId: string,
  residentId: string,
  bill: { unitId: string; cycleId: string },
): Promise<boolean> {
  const unitIds = await options.tenantDb.withTenant(societyId, (db) =>
    listUnitIdsForResident(db, residentId),
  );
  if (!unitIds.includes(bill.unitId)) return false;

  const cycle = await options.tenantDb.withTenant(societyId, (db) =>
    findBillingCycleById(db, bill.cycleId),
  );
  return cycle !== undefined && cycle !== null && cycle.status !== "draft";
}

function serializeBill(b: {
  id: string;
  societyId: string;
  unitId: string;
  cycleId: string;
  dueDate: string;
  status: string;
  subtotal: string | number;
  taxTotal: string | number;
  arrearsCarryForward: string | number;
  totalDue: string | number;
  paidAmount: string | number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: b.id,
    societyId: b.societyId,
    unitId: b.unitId,
    cycleId: b.cycleId,
    dueDate: b.dueDate,
    status: b.status,
    subtotal: Number(b.subtotal),
    taxTotal: Number(b.taxTotal),
    arrearsCarryForward: Number(b.arrearsCarryForward),
    totalDue: Number(b.totalDue),
    paidAmount: Number(b.paidAmount),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function serializeLineItem(li: {
  id: string;
  billId: string;
  headId: string;
  description: string;
  qty: string | number;
  rate: string | number;
  amount: string | number;
  taxAmount: string | number;
}) {
  return {
    id: li.id,
    billId: li.billId,
    headId: li.headId,
    description: li.description,
    qty: Number(li.qty),
    rate: Number(li.rate),
    amount: Number(li.amount),
    taxAmount: Number(li.taxAmount),
  };
}
