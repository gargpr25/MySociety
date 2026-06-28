import {
  createAdminUser,
  createBillingCycle,
  createBillHead,
  createDb,
  createResident,
  createSociety,
  createTower,
  createUnit,
  findBillById,
  findRoleByName,
  runMigrations,
  updateBillingCycleStatus,
} from "@mysociety/db";
import { FakePaymentProvider } from "@mysociety/config";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { signAccessToken } from "./auth/jwt.js";
import { createTenantAwareDb, type TenantAwareDb } from "./db.js";
import { generateBillsForCycle } from "./billing/billing-engine.js";

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mysociety_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

const JWT_SECRET = "test-jwt-secret-at-least-16-chars";

let adminPool: Pool;
let tenantDb: TenantAwareDb;
const createdSocietyIds: string[] = [];

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl });
  await runMigrations(adminPool);
  tenantDb = createTenantAwareDb(appUrl);
});

afterAll(async () => {
  if (createdSocietyIds.length > 0) {
    await adminPool.query("DELETE FROM societies WHERE id = ANY($1)", [createdSocietyIds]);
  }
  await adminPool.end();
  await tenantDb.pool.end();
});

async function setupSociety(name: string) {
  const adminDb = createDb(adminPool);
  const society = await createSociety(adminDb, { name: `${name} ${Date.now()}-${Math.random()}` });
  if (!society) throw new Error("failed to create society");
  createdSocietyIds.push(society.id);

  const adminRole = await findRoleByName(adminDb, "society_admin");
  if (!adminRole) throw new Error("society_admin role not seeded");
  const admin = await createAdminUser(adminDb, {
    societyId: society.id,
    roleId: adminRole.id,
    email: `pay-admin-${Date.now()}-${Math.random()}@test.com`,
    name: "Pay Admin",
  });
  if (!admin) throw new Error("failed to create admin");

  const superAdminRole = await findRoleByName(adminDb, "platform_super_admin");
  if (!superAdminRole) throw new Error("platform_super_admin role not seeded");
  const superAdmin = await createAdminUser(adminDb, {
    societyId: null,
    roleId: superAdminRole.id,
    email: `super-${Date.now()}-${Math.random()}@test.com`,
    name: "Super Admin",
  });
  if (!superAdmin) throw new Error("failed to create super admin");

  const adminToken = signAccessToken(JWT_SECRET, {
    id: admin.id,
    kind: "admin",
    societyId: society.id,
    role: "society_admin",
    name: admin.name,
    identifier: admin.email,
  });

  const superAdminToken = signAccessToken(JWT_SECRET, {
    id: superAdmin.id,
    kind: "admin",
    societyId: "",
    role: "platform_super_admin",
    name: superAdmin.name,
    identifier: superAdmin.email,
  });

  return { society, admin, adminToken, superAdmin, superAdminToken };
}

async function setupBillForPayment(societyId: string) {
  const adminDb = createDb(adminPool);
  const role = await findRoleByName(adminDb, "resident_owner");
  if (!role) throw new Error("resident_owner role not seeded");

  return tenantDb.withTenant(societyId, async (tx) => {
    const tower = await createTower(tx, { societyId, name: `PayTower-${Date.now()}` });
    if (!tower) throw new Error("failed to create tower");
    const unit = await createUnit(tx, {
      societyId,
      towerId: tower.id,
      flatNo: `P${Math.floor(100 + Math.random() * 900)}`,
      type: "2bhk",
      carpetArea: 1000,
    });
    if (!unit) throw new Error("failed to create unit");

    const resident = await createResident(tx, {
      societyId,
      unitId: unit.id,
      roleId: role.id,
      name: "Pay Resident",
      mobile: `9${Math.floor(100_000_000 + Math.random() * 800_000_000)}`,
    });
    if (!resident) throw new Error("failed to create resident");

    const head = await createBillHead(tx, {
      societyId,
      name: "Maintenance",
      computeRule: "fixed",
      rate: 3000,
    });
    if (!head) throw new Error("failed to create bill head");

    const today = new Date();
    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const dueDate = `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, "0")}-01`;

    const cycle = await createBillingCycle(tx, {
      societyId,
      period,
      dueDate,
    });
    if (!cycle) throw new Error("failed to create billing cycle");

    await generateBillsForCycle(tx, societyId, cycle.id);
    await updateBillingCycleStatus(tx, cycle.id, "published");

    const allBills = await tx.query.bills.findMany({ where: (t, { eq }) => eq(t.cycleId, cycle.id) });
    const bill = allBills.find((b) => b.unitId === unit.id);
    if (!bill) throw new Error("failed to find generated bill");

    const residentToken = signAccessToken(JWT_SECRET, {
      id: resident.id,
      kind: "resident",
      societyId,
      role: "resident_owner",
      name: resident.name,
      identifier: resident.mobile,
    });

    return { unit, resident, residentToken, bill };
  });
}

// ── Payment flow tests ─────────────────────────────────────────────────────────

describe("Payments — order + webhook → bill paid", () => {
  it("full payment marks bill as paid", async () => {
    const { society, adminToken } = await setupSociety("Pay Full");
    const { bill, residentToken } = await setupBillForPayment(society.id);

    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    // Create order
    const orderRes = await app.inject({
      method: "POST",
      url: "/payments/order",
      headers: { Authorization: `Bearer ${residentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ billId: bill.id }),
    });
    expect(orderRes.statusCode).toBe(201);
    const order = orderRes.json<{ providerOrderId: string; amountPaise: number }>();
    expect(order.amountPaise).toBe(Math.round(bill.totalDue * 100));

    // Simulate gateway captures the payment and sends webhook
    const paymentId = `fake_pay_${Date.now()}`;
    const { body, signature } = fakeProvider.buildWebhook(
      "payment.captured",
      paymentId,
      order.providerOrderId,
      order.amountPaise,
    );

    const webhookRes = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "Content-Type": "application/json", "x-payment-signature": signature },
      body,
    });
    expect(webhookRes.statusCode).toBe(200);
    expect(webhookRes.json<{ ok: boolean }>().ok).toBe(true);

    // Bill should now be paid
    const updated = await tenantDb.withTenant(society.id, (db) => findBillById(db, bill.id));
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAmount).toBeCloseTo(bill.totalDue, 2);

    // Admin can see payment in list
    const listRes = await app.inject({
      method: "GET",
      url: "/admin/payments",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const payments = listRes.json<{ status: string }[]>();
    expect(payments.some((p) => p.status === "captured")).toBe(true);

    await app.close();
  });

  it("partial payment yields partial status", async () => {
    const { society } = await setupSociety("Pay Partial");
    const { bill, residentToken } = await setupBillForPayment(society.id);

    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    const orderRes = await app.inject({
      method: "POST",
      url: "/payments/order",
      headers: { Authorization: `Bearer ${residentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ billId: bill.id }),
    });
    expect(orderRes.statusCode).toBe(201);
    const order = orderRes.json<{ providerOrderId: string; amountPaise: number }>();

    // Pay only half
    const partialPaise = Math.floor(order.amountPaise / 2);
    const paymentId = `fake_pay_partial_${Date.now()}`;
    const { body, signature } = fakeProvider.buildWebhook(
      "payment.captured",
      paymentId,
      order.providerOrderId,
      partialPaise,
    );

    const webhookRes = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "Content-Type": "application/json", "x-payment-signature": signature },
      body,
    });
    expect(webhookRes.statusCode).toBe(200);

    const updated = await tenantDb.withTenant(society.id, (db) => findBillById(db, bill.id));
    expect(updated?.status).toBe("partial");
    expect(updated?.paidAmount).toBeGreaterThan(0);
    expect(updated?.paidAmount).toBeLessThan(bill.totalDue);

    await app.close();
  });

  it("duplicate webhook is idempotent", async () => {
    const { society } = await setupSociety("Pay Idempotent");
    const { bill, residentToken } = await setupBillForPayment(society.id);

    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    const orderRes = await app.inject({
      method: "POST",
      url: "/payments/order",
      headers: { Authorization: `Bearer ${residentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ billId: bill.id }),
    });
    const order = orderRes.json<{ providerOrderId: string; amountPaise: number }>();

    const paymentId = `fake_pay_idem_${Date.now()}`;
    const { body, signature } = fakeProvider.buildWebhook(
      "payment.captured",
      paymentId,
      order.providerOrderId,
      order.amountPaise,
    );

    // Send webhook twice
    await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "Content-Type": "application/json", "x-payment-signature": signature },
      body,
    });
    const secondRes = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "Content-Type": "application/json", "x-payment-signature": signature },
      body,
    });
    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.json<{ duplicate?: boolean }>().duplicate).toBe(true);

    // Bill still "paid" exactly once — paidAmount should not exceed totalDue
    const updated = await tenantDb.withTenant(society.id, (db) => findBillById(db, bill.id));
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAmount).toBeCloseTo(bill.totalDue, 2);

    await app.close();
  });

  it("invalid webhook signature returns 400", async () => {
    const { residentToken } = await setupBillForPayment((await setupSociety("Pay BadSig")).society.id);
    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    const res = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "Content-Type": "application/json", "x-payment-signature": "badsig" },
      body: JSON.stringify({ event: "payment.captured", paymentId: "x", orderId: "y", amountPaise: 100 }),
    });
    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("reconciliation recovers a dropped webhook", async () => {
    const { society, adminToken } = await setupSociety("Pay Reconcile");
    const { bill, residentToken } = await setupBillForPayment(society.id);

    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    // Create order — no webhook arrives
    const orderRes = await app.inject({
      method: "POST",
      url: "/payments/order",
      headers: { Authorization: `Bearer ${residentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ billId: bill.id }),
    });
    expect(orderRes.statusCode).toBe(201);
    const order = orderRes.json<{ providerOrderId: string; amountPaise: number }>();

    // Backdate the payment so it's past the reconciliation cutoff
    await adminPool.query("UPDATE payments SET created_at = now() - interval '10 minutes' WHERE provider_order_id = $1", [
      order.providerOrderId,
    ]);

    // Configure fake provider to report the order as captured
    const providerPaymentId = `fake_recon_pay_${Date.now()}`;
    fakeProvider.markOrderCaptured(order.providerOrderId, providerPaymentId, order.amountPaise);

    // Trigger reconciliation
    const reconRes = await app.inject({
      method: "POST",
      url: "/admin/payments/reconcile",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(reconRes.statusCode).toBe(200);
    const reconResult = reconRes.json<{ reconciled: number; checked: number }>();
    expect(reconResult.reconciled).toBe(1);

    // Bill should now be paid
    const updated = await tenantDb.withTenant(society.id, (db) => findBillById(db, bill.id));
    expect(updated?.status).toBe("paid");

    await app.close();
  });
});

// ── Bank account onboarding tests ──────────────────────────────────────────────

describe("Bank account onboarding", () => {
  it("society_admin can submit a bank account", async () => {
    const { society, adminToken } = await setupSociety("Bank Submit");
    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    const res = await app.inject({
      method: "POST",
      url: "/admin/bank-accounts",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName: "Green Valley RWA",
        accountNumber: "12345678901234",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
      }),
    });
    expect(res.statusCode).toBe(201);
    const account = res.json<{ status: string; accountNumberLast4: string }>();
    expect(account.status).toBe("pending_verification");
    expect(account.accountNumberLast4).toBe("1234");

    // Can list it
    const listRes = await app.inject({
      method: "GET",
      url: "/admin/bank-accounts",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json<{ id: string }[]>();
    expect(list.length).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it("society_admin cannot approve a bank account (403)", async () => {
    const { society, adminToken, superAdminToken } = await setupSociety("Bank ApproveBlock");
    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    // Submit bank account as society_admin
    const submitRes = await app.inject({
      method: "POST",
      url: "/admin/bank-accounts",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName: "Sunrise RWA",
        accountNumber: "98765432101234",
        ifsc: "SBIN0001234",
        bankName: "SBI",
      }),
    });
    expect(submitRes.statusCode).toBe(201);
    const account = submitRes.json<{ id: string }>();

    // Society_admin tries to approve — must get 403
    const approveRes = await app.inject({
      method: "POST",
      url: `/admin/societies/${society.id}/bank-accounts/${account.id}/approve`,
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(approveRes.statusCode).toBe(403);

    await app.close();
  });

  it("platform_super_admin can approve and audit log is written", async () => {
    const { society, adminToken, superAdminToken } = await setupSociety("Bank ApproveSA");
    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    // Submit
    const submitRes = await app.inject({
      method: "POST",
      url: "/admin/bank-accounts",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName: "Palm Grove RWA",
        accountNumber: "11223344556677",
        ifsc: "ICIC0001234",
        bankName: "ICICI Bank",
      }),
    });
    expect(submitRes.statusCode).toBe(201);
    const account = submitRes.json<{ id: string }>();

    // Approve as platform_super_admin
    const approveRes = await app.inject({
      method: "POST",
      url: `/admin/societies/${society.id}/bank-accounts/${account.id}/approve`,
      headers: { Authorization: `Bearer ${superAdminToken}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(approveRes.statusCode).toBe(200);
    const approved = approveRes.json<{ status: string; razorpayLinkedAccountId: string }>();
    expect(approved.status).toBe("approved");
    expect(approved.razorpayLinkedAccountId).toMatch(/^fake_acc_/);

    // Audit log should have both submitted + approved entries
    const auditRes = await app.inject({
      method: "GET",
      url: "/admin/audit-log",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    const entries = auditRes.json<{ action: string }[]>();
    expect(entries.some((e) => e.action === "bank_account.submitted")).toBe(true);
    expect(entries.some((e) => e.action === "bank_account.approved")).toBe(true);

    await app.close();
  });

  it("platform_super_admin can reject a bank account", async () => {
    const { society, adminToken, superAdminToken } = await setupSociety("Bank Reject");
    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    const submitRes = await app.inject({
      method: "POST",
      url: "/admin/bank-accounts",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName: "Bad Actor RWA",
        accountNumber: "00000000001234",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
      }),
    });
    const account = submitRes.json<{ id: string }>();

    const rejectRes = await app.inject({
      method: "POST",
      url: `/admin/societies/${society.id}/bank-accounts/${account.id}/reject`,
      headers: { Authorization: `Bearer ${superAdminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "KYC documents mismatch" }),
    });
    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.json<{ status: string; rejectionReason: string }>().status).toBe("rejected");

    await app.close();
  });

  it("RLS: society A cannot see society B's bank accounts", async () => {
    const { adminToken: tokenA, society: societyA } = await setupSociety("Bank RLS A");
    const { adminToken: tokenB, society: societyB } = await setupSociety("Bank RLS B");

    const fakeProvider = new FakePaymentProvider();
    const superAdminDb = createDb(adminPool);
    const app = buildApp({ tenantDb, superAdminDb, jwtSecret: JWT_SECRET, paymentProvider: fakeProvider });

    // Submit bank account for society B
    await app.inject({
      method: "POST",
      url: "/admin/bank-accounts",
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName: "Society B RWA",
        accountNumber: "99988877761234",
        ifsc: "HDFC0001234",
        bankName: "HDFC Bank",
      }),
    });

    // Society A queries its own bank accounts — should see 0
    const listRes = await app.inject({
      method: "GET",
      url: "/admin/bank-accounts",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.statusCode).toBe(200);
    const accounts = listRes.json<{ id: string }[]>();
    // Should not contain society B's accounts
    expect(accounts.length).toBe(0);

    await app.close();
  });
});
