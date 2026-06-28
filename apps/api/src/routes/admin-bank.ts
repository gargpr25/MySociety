import type { FastifyInstance } from "fastify";
import {
  createBankAccount,
  findBankAccountById,
  insertAuditLog,
  listAuditLog,
  listBankAccounts,
  updateBankAccountStatus,
  type Database,
} from "@mysociety/db";
import { createBankAccountSchema, rejectBankAccountSchema } from "@mysociety/types";
import type { PaymentProvider } from "@mysociety/config";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";

export interface AdminBankRouteOptions {
  tenantDb: TenantAwareDb;
  superAdminDb: Database;
  jwtSecret: string;
  paymentProvider: PaymentProvider;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin", "society_accountant"] as const;

export function registerAdminBankRoutes(app: FastifyInstance, options: AdminBankRouteOptions) {
  const { tenantDb, superAdminDb, paymentProvider } = options;
  const adminPreHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];
  const superAdminPreHandler = [authenticate(options.jwtSecret), requireRole("platform_super_admin")];

  // ── Society admin: submit a bank account for the current society ────────────

  app.post("/admin/bank-accounts", { preHandler: adminPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    if (principal.role !== "society_admin") return reply.code(403).send({ error: "Only society_admin can submit bank accounts" });

    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = createBankAccountSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const { accountName, accountNumber, ifsc, bankName } = parsed.data;
    const last4 = accountNumber.slice(-4);
    // In production this would be encrypted with a KMS key. For now, store as-is
    // (field named _encrypted to signal intent).
    const encrypted = accountNumber;

    const account = await tenantDb.withTenant(societyId, (db) =>
      createBankAccount(db, {
        societyId,
        accountName,
        accountNumberLast4: last4,
        accountNumberEncrypted: encrypted,
        ifsc,
        bankName,
        createdBy: principal.id,
      }),
    );

    await insertAuditLog(superAdminDb, {
      societyId,
      actorId: principal.id,
      actorKind: "admin",
      action: "bank_account.submitted",
      entityType: "society_bank_accounts",
      entityId: account?.id,
      afterState: { accountName, ifsc, bankName, last4 },
    });

    return reply.code(201).send(serializeBankAccount(account!));
  });

  // ── Society admin: list bank accounts for the current society ───────────────

  app.get("/admin/bank-accounts", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const accounts = await tenantDb.withTenant(societyId, (db) => listBankAccounts(db));
    return reply.send(accounts.map(serializeBankAccount));
  });

  // ── Platform super admin: list bank accounts for any society ────────────────

  app.get(
    "/admin/societies/:societyId/bank-accounts",
    { preHandler: superAdminPreHandler },
    async (request, reply) => {
      const { societyId } = request.params as { societyId: string };
      const accounts = await tenantDb.withTenant(societyId, (db) => listBankAccounts(db));
      return reply.send(accounts.map(serializeBankAccount));
    },
  );

  // ── Platform super admin: approve a bank account ────────────────────────────

  app.post(
    "/admin/societies/:societyId/bank-accounts/:id/approve",
    { preHandler: superAdminPreHandler },
    async (request, reply) => {
      const { societyId, id } = request.params as { societyId: string; id: string };
      const principal = request.principal;
      if (!principal) return reply.code(401).send({ error: "Unauthorized" });

      // Look up account cross-tenant using superAdminDb (bypasses RLS)
      const existing = await findBankAccountById(superAdminDb, id);
      if (!existing) return reply.code(404).send({ error: "Bank account not found" });
      if (existing.societyId !== societyId) return reply.code(404).send({ error: "Bank account not found" });
      if (existing.status === "approved") return reply.code(400).send({ error: "Already approved" });
      if (existing.status === "rejected") return reply.code(400).send({ error: "Account was rejected; submit a new one" });

      // Create linked account via payment provider
      const linkedResult = await paymentProvider.createLinkedAccount({
        societyId,
        businessName: existing.accountName,
        email: `bank-${id}@society.internal`,
        ifsc: existing.ifsc,
        accountNumber: existing.accountNumberEncrypted,
        accountName: existing.accountName,
      });

      const updated = await tenantDb.withTenant(societyId, (db) =>
        updateBankAccountStatus(db, id, {
          status: "approved",
          razorpayLinkedAccountId: linkedResult.linkedAccountId,
          approvedBy: principal.id,
          approvedAt: new Date(),
        }),
      );

      await insertAuditLog(superAdminDb, {
        societyId,
        actorId: principal.id,
        actorKind: "admin",
        action: "bank_account.approved",
        entityType: "society_bank_accounts",
        entityId: id,
        beforeState: { status: existing.status },
        afterState: { status: "approved", linkedAccountId: linkedResult.linkedAccountId },
      });

      return reply.send(serializeBankAccount(updated!));
    },
  );

  // ── Platform super admin: reject a bank account ──────────────────────────────

  app.post(
    "/admin/societies/:societyId/bank-accounts/:id/reject",
    { preHandler: superAdminPreHandler },
    async (request, reply) => {
      const { societyId, id } = request.params as { societyId: string; id: string };
      const principal = request.principal;
      if (!principal) return reply.code(401).send({ error: "Unauthorized" });

      const parsed = rejectBankAccountSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

      const existing = await findBankAccountById(superAdminDb, id);
      if (!existing) return reply.code(404).send({ error: "Bank account not found" });
      if (existing.societyId !== societyId) return reply.code(404).send({ error: "Bank account not found" });
      if (existing.status === "approved") return reply.code(400).send({ error: "Cannot reject an already-approved account" });

      const updated = await tenantDb.withTenant(societyId, (db) =>
        updateBankAccountStatus(db, id, {
          status: "rejected",
          rejectionReason: parsed.data.reason,
        }),
      );

      await insertAuditLog(superAdminDb, {
        societyId,
        actorId: principal.id,
        actorKind: "admin",
        action: "bank_account.rejected",
        entityType: "society_bank_accounts",
        entityId: id,
        afterState: { status: "rejected", reason: parsed.data.reason },
      });

      return reply.send(serializeBankAccount(updated!));
    },
  );

  // ── Admin: audit log ────────────────────────────────────────────────────────

  app.get("/admin/audit-log", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const entries = await listAuditLog(superAdminDb, societyId);
    return reply.send(
      entries.map((e) => ({
        id: e.id,
        actorId: e.actorId,
        actorKind: e.actorKind,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        beforeState: e.beforeState,
        afterState: e.afterState,
        createdAt: e.createdAt.toISOString(),
      })),
    );
  });
}

function serializeBankAccount(a: {
  id: string;
  societyId: string;
  accountName: string;
  accountNumberLast4: string;
  ifsc: string;
  bankName: string;
  status: string;
  razorpayLinkedAccountId: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    societyId: a.societyId,
    accountName: a.accountName,
    accountNumberLast4: a.accountNumberLast4,
    ifsc: a.ifsc,
    bankName: a.bankName,
    status: a.status,
    razorpayLinkedAccountId: a.razorpayLinkedAccountId,
    approvedBy: a.approvedBy,
    approvedAt: a.approvedAt?.toISOString() ?? null,
    rejectionReason: a.rejectionReason,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
