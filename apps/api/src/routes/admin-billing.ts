import type { FastifyInstance } from "fastify";
import {
  bulkUpsertMeterReadings,
  createBillHead,
  createBillingCycle,
  deleteBillHead,
  findBillById,
  findBillHeadById,
  findBillingCycleById,
  findUnitById,
  getCollectionSummary,
  listBillHeads,
  listBillingCycles,
  listBillsByCycleId,
  listLineItemsByBillId,
  markOverdueBills,
  updateBillHead,
  updateBillingCycleStatus,
  upsertMeterReading,
} from "@mysociety/db";
import {
  createBillHeadSchema,
  updateBillHeadSchema,
  createBillingCycleSchema,
  upsertMeterReadingSchema,
} from "@mysociety/types";
import { z } from "zod";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import { generateBillsForCycle } from "../billing/billing-engine.js";
import type { DispatcherFn } from "../connectors/dispatcher.js";

export interface AdminBillingRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
  dispatcher?: DispatcherFn;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin", "society_accountant"] as const;

export function registerAdminBillingRoutes(app: FastifyInstance, options: AdminBillingRouteOptions) {
  const preHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];
  const { dispatcher } = options;

  // ── Bill Heads ────────────────────────────────────────────────────────────────

  app.get("/admin/billing/heads", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const heads = await options.tenantDb.withTenant(societyId, (db) => listBillHeads(db));
    return reply.send(heads.map(serializeBillHead));
  });

  app.post("/admin/billing/heads", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = createBillHeadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const head = await options.tenantDb.withTenant(societyId, (db) =>
      createBillHead(db, { societyId, ...parsed.data }),
    );
    return reply.code(201).send(serializeBillHead(head!));
  });

  app.patch("/admin/billing/heads/:id", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = updateBillHeadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const existing = await options.tenantDb.withTenant(societyId, (db) => findBillHeadById(db, id));
    if (!existing) return reply.code(404).send({ error: "Bill head not found" });

    const updated = await options.tenantDb.withTenant(societyId, (db) =>
      updateBillHead(db, id, parsed.data),
    );
    return reply.send(serializeBillHead(updated!));
  });

  app.delete("/admin/billing/heads/:id", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const existing = await options.tenantDb.withTenant(societyId, (db) => findBillHeadById(db, id));
    if (!existing) return reply.code(404).send({ error: "Bill head not found" });

    await options.tenantDb.withTenant(societyId, (db) => deleteBillHead(db, id));
    return reply.code(204).send();
  });

  // ── Billing Cycles ─────────────────────────────────────────────────────────────

  app.get("/admin/billing/cycles", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const cycles = await options.tenantDb.withTenant(societyId, (db) => listBillingCycles(db));
    return reply.send(cycles.map(serializeCycle));
  });

  app.post("/admin/billing/cycles", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = createBillingCycleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const cycle = await options.tenantDb.withTenant(societyId, (db) =>
      createBillingCycle(db, { societyId, ...parsed.data }),
    );
    return reply.code(201).send(serializeCycle(cycle!));
  });

  // Generate bills for a cycle (idempotent for draft cycles)
  app.post("/admin/billing/cycles/:id/generate", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    try {
      const result = await options.tenantDb.withTenant(societyId, (db) =>
        generateBillsForCycle(db, societyId, id),
      );
      if (dispatcher && result.billsGenerated > 0) {
        const cycle = await options.tenantDb.withTenant(societyId, (db) => findBillingCycleById(db, id));
        const bills = await options.tenantDb.withTenant(societyId, (db) => listBillsByCycleId(db, id));
        for (const bill of bills) {
          dispatcher({
            type: "bill.generated",
            societyId,
            billId: bill.id,
            unitId: bill.unitId,
            cycleId: id,
            period: cycle?.period ?? "",
            totalDue: bill.totalDue,
          }).catch(() => undefined);
        }
      }
      return reply.send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      return reply.code(400).send({ error: msg });
    }
  });

  // Publish a cycle (draft → published)
  app.post("/admin/billing/cycles/:id/publish", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const cycle = await options.tenantDb.withTenant(societyId, (db) => findBillingCycleById(db, id));
    if (!cycle) return reply.code(404).send({ error: "Billing cycle not found" });
    if (cycle.status !== "draft") return reply.code(400).send({ error: `Cannot publish a cycle in '${cycle.status}' status` });

    const updated = await options.tenantDb.withTenant(societyId, (db) =>
      updateBillingCycleStatus(db, id, "published"),
    );
    return reply.send(serializeCycle(updated!));
  });

  // Close a cycle (published → closed)
  app.post("/admin/billing/cycles/:id/close", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const cycle = await options.tenantDb.withTenant(societyId, (db) => findBillingCycleById(db, id));
    if (!cycle) return reply.code(404).send({ error: "Billing cycle not found" });
    if (cycle.status !== "published") return reply.code(400).send({ error: `Cannot close a cycle in '${cycle.status}' status` });

    // Mark overdue before closing
    await options.tenantDb.withTenant(societyId, (db) =>
      markOverdueBills(db, new Date().toISOString().slice(0, 10)),
    );

    const updated = await options.tenantDb.withTenant(societyId, (db) =>
      updateBillingCycleStatus(db, id, "closed"),
    );
    return reply.send(serializeCycle(updated!));
  });

  // Collection summary (dashboard)
  app.get("/admin/billing/cycles/:id/summary", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const cycle = await options.tenantDb.withTenant(societyId, (db) => findBillingCycleById(db, id));
    if (!cycle) return reply.code(404).send({ error: "Billing cycle not found" });

    const summary = await options.tenantDb.withTenant(societyId, (db) => getCollectionSummary(db, id));
    return reply.send({ period: cycle.period, cycleId: id, status: cycle.status, ...summary });
  });

  // Bills for a cycle (per-unit ledger)
  app.get("/admin/billing/cycles/:id/bills", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const bills = await options.tenantDb.withTenant(societyId, (db) => listBillsByCycleId(db, id));
    return reply.send(bills.map(serializeBill));
  });

  // Bill detail (admin view — includes unit info)
  app.get("/admin/billing/bills/:id", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id: billId } = request.params as { id: string };
    const [bill, lineItems, unit] = await options.tenantDb.withTenant(societyId, async (db) => {
      const b = await findBillById(db, billId);
      const li = b ? await listLineItemsByBillId(db, billId) : [];
      const u = b ? await findUnitById(db, b.unitId) : null;
      return [b, li, u] as const;
    });

    if (!bill) return reply.code(404).send({ error: "Bill not found" });

    return reply.send({ ...serializeBill(bill), lineItems: lineItems.map(serializeLineItem), unit });
  });

  // ── Meter Readings ─────────────────────────────────────────────────────────────

  app.put("/admin/billing/meter-readings", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = upsertMeterReadingSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const row = await options.tenantDb.withTenant(societyId, (db) =>
      upsertMeterReading(db, { societyId, ...parsed.data }),
    );
    return reply.send(row);
  });

  // Bulk meter readings (CSV-like array upload)
  const bulkMeterReadingsSchema = z.object({
    readings: z.array(upsertMeterReadingSchema).min(1),
    period: z.string().regex(/^\d{4}-\d{2}$/),
  });

  app.post("/admin/billing/meter-readings/bulk", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = bulkMeterReadingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const rows = parsed.data.readings.map((r) => ({
      societyId,
      unitId: r.unitId,
      headId: r.headId,
      period: r.period,
      prevReading: r.prevReading,
      currentReading: r.currentReading,
    }));

    await options.tenantDb.withTenant(societyId, (db) => bulkUpsertMeterReadings(db, rows));
    return reply.send({ imported: rows.length });
  });
}

function serializeBillHead(h: {
  id: string;
  societyId: string;
  name: string;
  computeRule: string;
  rate: string | number;
  taxRule: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: h.id,
    societyId: h.societyId,
    name: h.name,
    computeRule: h.computeRule,
    rate: Number(h.rate),
    taxRule: h.taxRule,
    isActive: h.isActive,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

function serializeCycle(c: {
  id: string;
  societyId: string;
  period: string;
  dueDate: string;
  status: string;
  lateFeeRule: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    societyId: c.societyId,
    period: c.period,
    dueDate: c.dueDate,
    status: c.status,
    lateFeeRule: c.lateFeeRule,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
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
