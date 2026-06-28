import type { FastifyInstance } from "fastify";
import {
  applyPaymentToBill,
  createPayment,
  createPaymentAllocations,
  findBillById,
  findPaymentByProviderOrderId,
  insertAuditLog,
  listAllocationsByPaymentId,
  listPaymentsByResident,
  listPaymentsBySociety,
  listPendingPaymentsOlderThan,
  markGatewayEventProcessed,
  updatePaymentCaptured,
  updatePaymentFailed,
  upsertGatewayEvent,
  type Database,
} from "@mysociety/db";
import { createPaymentOrderSchema } from "@mysociety/types";
import type { PaymentProvider } from "@mysociety/config";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";

export interface PaymentRouteOptions {
  tenantDb: TenantAwareDb;
  superAdminDb: Database;
  jwtSecret: string;
  paymentProvider: PaymentProvider;
  dispatcher?: import("../connectors/dispatcher.js").DispatcherFn;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin", "society_accountant"] as const;
const RESIDENT_ROLES = ["resident_owner", "resident_tenant", "resident_family"] as const;

export function registerPaymentRoutes(app: FastifyInstance, options: PaymentRouteOptions) {
  const { tenantDb, superAdminDb, paymentProvider, dispatcher } = options;
  const residentPreHandler = [authenticate(options.jwtSecret), requireRole(...RESIDENT_ROLES)];
  const adminPreHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];

  // ── Resident: create payment order ──────────────────────────────────────────

  app.post("/payments/order", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });

    const parsed = createPaymentOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const { billId } = parsed.data;
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });
    const residentId = principal.id;

    const bill = await tenantDb.withTenant(societyId, (db) => findBillById(db, billId));
    if (!bill) return reply.code(404).send({ error: "Bill not found" });
    if (bill.status === "paid") return reply.code(400).send({ error: "Bill is already paid" });

    const remaining = bill.totalDue - bill.paidAmount;
    if (remaining <= 0) return reply.code(400).send({ error: "No amount outstanding" });

    const amountPaise = Math.round(remaining * 100);

    const orderResult = await paymentProvider.createOrder({
      billId,
      societyId,
      residentId,
      amountPaise,
    });

    const payment = await tenantDb.withTenant(societyId, (db) =>
      createPayment(db, {
        societyId,
        residentId,
        provider: "fake",
        providerOrderId: orderResult.providerOrderId,
        amountPaise,
        metadata: { billId, societyId },
      }),
    );

    return reply.code(201).send({
      id: payment!.id,
      orderId: orderResult.orderId,
      providerOrderId: orderResult.providerOrderId,
      amountPaise,
      currency: orderResult.currency,
      billId,
    });
  });

  // ── Webhook: gateway payment notification ───────────────────────────────────
  // No auth — verified by signature. Idempotent by event_id.
  // Uses superAdminDb (bypasses RLS) for cross-tenant lookups on payments.

  app.post("/payments/webhook", async (request, reply) => {
    const rawBody = JSON.stringify(request.body);
    const signature = (request.headers["x-payment-signature"] as string) ?? "";

    const parsed = paymentProvider.parseWebhookEvent(rawBody, signature);
    if (!parsed.valid) return reply.code(400).send({ error: "Invalid webhook signature" });

    // gateway_events has no RLS — superAdminDb for consistent cross-tenant access
    const { alreadyProcessed, row: gevRow } = await upsertGatewayEvent(superAdminDb, {
      provider: "fake",
      eventId: parsed.eventId,
      eventType: parsed.event,
      payload: parsed,
    });

    if (alreadyProcessed) return reply.send({ ok: true, duplicate: true });

    if (parsed.event === "payment.captured") {
      // superAdminDb bypasses RLS for cross-tenant payment lookup
      const payment = await findPaymentByProviderOrderId(superAdminDb, parsed.orderId);

      if (payment && payment.status === "pending") {
        await tenantDb.withTenant(payment.societyId, async (db) => {
          await updatePaymentCaptured(db, payment.id, parsed.paymentId);

          const billId = (payment.metadata as { billId?: string }).billId;
          if (billId) {
            await createPaymentAllocations(db, [
              {
                societyId: payment.societyId,
                paymentId: payment.id,
                billId,
                amountPaise: parsed.amountPaise,
              },
            ]);
            await applyPaymentToBill(db, billId, parsed.amountPaise);
          }

          await insertAuditLog(db, {
            societyId: payment.societyId,
            actorKind: "system",
            action: "payment.captured",
            entityType: "payments",
            entityId: payment.id,
            afterState: { providerPaymentId: parsed.paymentId, amountPaise: parsed.amountPaise },
          });
        });
        dispatcher?.({
          type: "payment.captured",
          societyId: payment.societyId,
          paymentId: payment.id,
          residentId: payment.residentId,
          amountRupees: payment.amountPaise / 100,
        }).catch(() => undefined);
      }
    } else if (parsed.event === "payment.failed") {
      const payment = await findPaymentByProviderOrderId(superAdminDb, parsed.orderId);
      if (payment && payment.status === "pending") {
        await tenantDb.withTenant(payment.societyId, (db) => updatePaymentFailed(db, payment.id));
      }
    }

    await markGatewayEventProcessed(superAdminDb, gevRow.id);

    return reply.send({ ok: true });
  });

  // ── Admin: list payments ──────────────────────────────────────────────────────

  app.get("/admin/payments", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const paymentList = await tenantDb.withTenant(societyId, (db) => listPaymentsBySociety(db));
    return reply.send(paymentList.map(serializePayment));
  });

  // ── Admin: reconciliation ─────────────────────────────────────────────────────

  app.post("/admin/payments/reconcile", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const pending = await tenantDb.withTenant(societyId, (db) =>
      listPendingPaymentsOlderThan(db, cutoff),
    );

    let recovered = 0;
    for (const payment of pending) {
      const orderStatus = await paymentProvider.getOrderStatus(payment.providerOrderId);
      if (orderStatus.status === "captured" && orderStatus.paymentId) {
        await tenantDb.withTenant(payment.societyId, async (db) => {
          await updatePaymentCaptured(db, payment.id, orderStatus.paymentId!);

          const billId = (payment.metadata as { billId?: string }).billId;
          if (billId) {
            const alreadyAllocated = await listAllocationsByPaymentId(db, payment.id);
            if (alreadyAllocated.length === 0) {
              await createPaymentAllocations(db, [
                {
                  societyId: payment.societyId,
                  paymentId: payment.id,
                  billId,
                  amountPaise: payment.amountPaise,
                },
              ]);
              await applyPaymentToBill(db, billId, payment.amountPaise);
            }
          }

          await insertAuditLog(db, {
            societyId: payment.societyId,
            actorKind: "system",
            action: "payment.reconciled",
            entityType: "payments",
            entityId: payment.id,
            afterState: { providerPaymentId: orderStatus.paymentId, amountPaise: payment.amountPaise },
          });
        });
        recovered++;
      } else if (orderStatus.status === "failed") {
        await tenantDb.withTenant(payment.societyId, (db) => updatePaymentFailed(db, payment.id));
      }
    }

    return reply.send({ reconciled: recovered, checked: pending.length });
  });

  // ── Resident: list my payments ────────────────────────────────────────────────

  app.get("/resident/payments", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const paymentList = await tenantDb.withTenant(societyId, (db) =>
      listPaymentsByResident(db, principal.id),
    );
    return reply.send(paymentList.map(serializePayment));
  });
}

function serializePayment(p: {
  id: string;
  societyId: string;
  residentId: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: number;
  currency: string;
  status: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    residentId: p.residentId,
    provider: p.provider,
    providerOrderId: p.providerOrderId,
    providerPaymentId: p.providerPaymentId,
    amountPaise: p.amountPaise,
    amountRupees: p.amountPaise / 100,
    currency: p.currency,
    status: p.status,
    metadata: p.metadata,
    createdAt: p.createdAt.toISOString(),
  };
}
