import type { FastifyInstance } from "fastify";
import {
  findBillById,
  findBillingCycleById,
  findResidentById,
  findUnitById,
  listBillsByUnitId,
  listLineItemsByBillId,
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

    const resident = await options.tenantDb.withTenant(societyId, (db) =>
      findResidentById(db, residentId),
    );
    if (!resident?.unitId) return reply.send([]);

    const bills = await options.tenantDb.withTenant(societyId, (db) =>
      listBillsByUnitId(db, resident.unitId!),
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

    const resident = await options.tenantDb.withTenant(societyId, (db) =>
      findResidentById(db, residentId),
    );
    if (resident?.unitId !== bill.unitId) return reply.code(404).send({ error: "Bill not found" });

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

    const resident = await options.tenantDb.withTenant(societyId, (db) =>
      findResidentById(db, residentId),
    );
    if (resident?.unitId !== bill.unitId) return reply.code(404).send({ error: "Bill not found" });

    const [lineItems, cycle, unit] = await options.tenantDb.withTenant(societyId, async (db) => {
      const li = await listLineItemsByBillId(db, billId);
      const cy = await findBillingCycleById(db, bill.cycleId);
      const u = await findUnitById(db, bill.unitId);
      return [li, cy, u] as const;
    });

    const pdfBytes = await generateInvoicePdf({
      societyName: `Society ${societyId.slice(0, 8)}`,
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
