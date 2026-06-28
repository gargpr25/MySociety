import {
  createAdminUser,
  createDb,
  createResident,
  createSociety,
  createTower,
  createUnit,
  findRoleByName,
  runMigrations,
} from "@mysociety/db";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { signAccessToken } from "./auth/jwt.js";
import { createTenantAwareDb, type TenantAwareDb } from "./db.js";

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
    email: `billing-admin-${Date.now()}-${Math.random()}@test.com`,
    name: "Billing Admin",
  });
  if (!admin) throw new Error("failed to create admin");

  const adminToken = signAccessToken(JWT_SECRET, {
    id: admin.id,
    kind: "admin",
    societyId: society.id,
    role: "society_admin",
    name: admin.name,
    identifier: admin.email,
  });

  return { society, admin, adminToken };
}

async function setupUnit(societyId: string, carpetArea = 1000) {
  return tenantDb.withTenant(societyId, async (tx) => {
    const tower = await createTower(tx, { societyId, name: `BillTower-${Date.now()}` });
    if (!tower) throw new Error("failed to create tower");
    const unit = await createUnit(tx, {
      societyId,
      towerId: tower.id,
      flatNo: `B${Math.floor(100 + Math.random() * 900)}`,
      type: "2bhk",
      carpetArea,
    });
    if (!unit) throw new Error("failed to create unit");
    return { tower, unit };
  });
}

async function setupResident(societyId: string, unitId: string) {
  const adminDb = createDb(adminPool);
  const role = await findRoleByName(adminDb, "resident_owner");
  if (!role) throw new Error("resident_owner role not seeded");

  return tenantDb.withTenant(societyId, async (tx) => {
    const resident = await createResident(tx, {
      societyId,
      unitId,
      roleId: role.id,
      name: "Bill Resident",
      mobile: `9${Math.floor(100_000_000 + Math.random() * 800_000_000)}`,
    });
    if (!resident) throw new Error("failed to create resident");

    const token = signAccessToken(JWT_SECRET, {
      id: resident.id,
      kind: "resident",
      societyId,
      role: "resident_owner",
      name: resident.name,
      identifier: resident.mobile,
    });
    return { resident, token };
  });
}

describe("Billing engine — bill head CRUD", () => {
  it("admin can create and list bill heads", async () => {
    const { adminToken } = await setupSociety("BillHead CRUD");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const createRes = await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 3000, taxRule: { type: "none" } }),
    });
    expect(createRes.statusCode).toBe(201);
    const head = createRes.json<{ id: string; name: string; rate: number }>();
    expect(head.name).toBe("Maintenance");
    expect(head.rate).toBe(3000);

    const listRes = await app.inject({
      method: "GET",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const heads = listRes.json<{ id: string }[]>();
    expect(heads.some((h) => h.id === head.id)).toBe(true);

    await app.close();
  });

  it("admin can update and deactivate a bill head", async () => {
    const { adminToken } = await setupSociety("BillHead Update");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const createRes = await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Water", computeRule: "flat_per_unit", rate: 500 }),
    });
    const { id } = createRes.json<{ id: string }>();

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/admin/billing/heads/${id}`,
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rate: 600, isActive: false }),
    });
    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json<{ rate: number; isActive: boolean }>();
    expect(updated.rate).toBe(600);
    expect(updated.isActive).toBe(false);

    await app.close();
  });
});

describe("Billing engine — cycle + bill generation", () => {
  it("fixed compute rule: qty=1, amount=rate for every unit", async () => {
    const { society, adminToken } = await setupSociety("Fixed Rule");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const headRes = await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 3000 }),
    });
    expect(headRes.statusCode).toBe(201);

    await setupUnit(society.id);

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-01", dueDate: "2026-01-15" }),
    });
    expect(cycleRes.statusCode).toBe(201);
    const cycle = cycleRes.json<{ id: string }>();

    const genRes = await app.inject({
      method: "POST",
      url: `/admin/billing/cycles/${cycle.id}/generate`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(genRes.statusCode).toBe(200);
    const gen = genRes.json<{ billsGenerated: number }>();
    expect(gen.billsGenerated).toBe(1);

    const billsRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycle.id}/bills`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(billsRes.statusCode).toBe(200);
    const bills = billsRes.json<{ subtotal: number; totalDue: number }[]>();
    expect(bills[0]!.subtotal).toBe(3000);
    expect(bills[0]!.totalDue).toBe(3000);

    await app.close();
  });

  it("per_sqft compute rule: amount = rate × carpetArea", async () => {
    const { society, adminToken } = await setupSociety("PerSqft Rule");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Property Tax", computeRule: "per_sqft", rate: 2 }),
    });

    await setupUnit(society.id, 500); // carpet area = 500

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-02", dueDate: "2026-02-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();

    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    const billsRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycle.id}/bills`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bills = billsRes.json<{ subtotal: number }[]>();
    expect(bills[0]!.subtotal).toBe(1000); // 500 sqft × ₹2 = ₹1000

    await app.close();
  });

  it("metered compute rule: charges only units with readings", async () => {
    const { society, adminToken } = await setupSociety("Metered Rule");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const headRes = await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Electricity", computeRule: "metered", rate: 8 }),
    });
    const head = headRes.json<{ id: string }>();

    const { unit } = await setupUnit(society.id);

    // Upload a reading: prev=100, current=150 → consumption=50 units
    await app.inject({
      method: "PUT",
      url: "/admin/billing/meter-readings",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ unitId: unit.id, headId: head.id, period: "2026-03", prevReading: 100, currentReading: 150 }),
    });

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-03", dueDate: "2026-03-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();

    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    const billsRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycle.id}/bills`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bills = billsRes.json<{ subtotal: number }[]>();
    expect(bills[0]!.subtotal).toBe(400); // 50 units × ₹8 = ₹400

    await app.close();
  });

  it("tax rule — percentage tax is applied correctly", async () => {
    const { society, adminToken } = await setupSociety("Tax Rule");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 1000, taxRule: { type: "percentage", rate: 18 } }),
    });

    await setupUnit(society.id);

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-04", dueDate: "2026-04-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();

    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    const billsRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycle.id}/bills`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bills = billsRes.json<{ subtotal: number; taxTotal: number; totalDue: number }[]>();
    expect(bills[0]!.subtotal).toBe(1000);
    expect(bills[0]!.taxTotal).toBe(180); // 18% of 1000
    expect(bills[0]!.totalDue).toBe(1180);

    await app.close();
  });

  it("arrears carry-forward: unpaid balance from previous cycle adds to next", async () => {
    const { society, adminToken } = await setupSociety("Arrears");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 2000 }),
    });

    await setupUnit(society.id);

    // Generate cycle 1 — bill is ₹2000, will remain unpaid
    const c1Res = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-05", dueDate: "2026-05-15" }),
    });
    const c1 = c1Res.json<{ id: string }>();
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${c1.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    // Generate cycle 2 — should carry forward ₹2000 arrears
    const c2Res = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-06", dueDate: "2026-06-15" }),
    });
    const c2 = c2Res.json<{ id: string }>();
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${c2.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    const billsRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${c2.id}/bills`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bills = billsRes.json<{ arrearsCarryForward: number; subtotal: number; totalDue: number }[]>();
    expect(bills[0]!.arrearsCarryForward).toBe(2000);
    expect(bills[0]!.subtotal).toBe(2000);
    expect(bills[0]!.totalDue).toBe(4000);

    await app.close();
  });

  it("generation is idempotent: regenerating a draft cycle yields same result", async () => {
    const { society, adminToken } = await setupSociety("Idempotent");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Water", computeRule: "flat_per_unit", rate: 500 }),
    });
    await setupUnit(society.id);

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-07", dueDate: "2026-07-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();

    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    const billsRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycle.id}/bills`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const bills = billsRes.json<{ id: string }[]>();
    expect(bills).toHaveLength(1); // not doubled

    await app.close();
  });

  it("cannot regenerate a published cycle", async () => {
    const { society, adminToken } = await setupSociety("Published Block");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sewer", computeRule: "flat_per_unit", rate: 200 }),
    });
    await setupUnit(society.id);

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-08", dueDate: "2026-08-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();

    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/publish`, headers: { Authorization: `Bearer ${adminToken}` } });

    const regenRes = await app.inject({
      method: "POST",
      url: `/admin/billing/cycles/${cycle.id}/generate`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(regenRes.statusCode).toBe(400);

    await app.close();
  });

  it("collection summary aggregates paid/partial/overdue/unpaid correctly", async () => {
    const { society, adminToken } = await setupSociety("Summary");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 1000 }),
    });
    await setupUnit(society.id);

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-09", dueDate: "2026-09-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    const summaryRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycle.id}/summary`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json<{ totalBills: number; unpaid: number; totalDue: number }>();
    expect(summary.totalBills).toBe(1);
    expect(summary.unpaid).toBe(1);
    expect(summary.totalDue).toBe(1000);

    await app.close();
  });
});

describe("Billing engine — resident bill access", () => {
  it("resident can list and view their own bills", async () => {
    const { society, adminToken } = await setupSociety("Resident Bills");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 2500 }),
    });

    const { unit } = await setupUnit(society.id);
    const { token: residentToken } = await setupResident(society.id, unit.id);

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-10", dueDate: "2026-10-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    const listRes = await app.inject({
      method: "GET",
      url: "/resident/bills",
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const bills = listRes.json<{ id: string; totalDue: number }[]>();
    expect(bills).toHaveLength(1);
    expect(bills[0]!.totalDue).toBe(2500);

    // Detail view
    const detailRes = await app.inject({
      method: "GET",
      url: `/resident/bills/${bills[0]!.id}`,
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json<{ lineItems: { amount: number }[] }>();
    expect(detail.lineItems).toHaveLength(1);
    expect(detail.lineItems[0]!.amount).toBe(2500);

    await app.close();
  });

  it("resident cannot access another unit's bill", async () => {
    const { society, adminToken } = await setupSociety("Bill RLS Resident");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 1500 }),
    });

    const { unit: unit1 } = await setupUnit(society.id);
    const { unit: unit2 } = await setupUnit(society.id);
    // resident belongs to unit2, but tries to access unit1's bill
    const { token: residentToken } = await setupResident(society.id, unit2.id);

    const cycleRes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-11", dueDate: "2026-11-15" }),
    });
    const cycle = cycleRes.json<{ id: string }>();
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycle.id}/generate`, headers: { Authorization: `Bearer ${adminToken}` } });

    // Get unit1's bill id from admin endpoint
    const adminBillsRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycle.id}/bills`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const allBills = adminBillsRes.json<{ id: string; unitId: string }[]>();
    const unit1Bill = allBills.find((b) => b.unitId === unit1.id)!;

    const res = await app.inject({
      method: "GET",
      url: `/resident/bills/${unit1Bill.id}`,
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it("RLS: bills from society A not visible to society B admin", async () => {
    const { society: societyA, adminToken: adminTokenA } = await setupSociety("Bill RLS A");
    const { adminToken: adminTokenB } = await setupSociety("Bill RLS B");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    // Set up bill in society A
    await app.inject({
      method: "POST",
      url: "/admin/billing/heads",
      headers: { Authorization: `Bearer ${adminTokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maintenance", computeRule: "fixed", rate: 1000 }),
    });
    await setupUnit(societyA.id);
    const cycleARes = await app.inject({
      method: "POST",
      url: "/admin/billing/cycles",
      headers: { Authorization: `Bearer ${adminTokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ period: "2026-12", dueDate: "2026-12-15" }),
    });
    const cycleA = cycleARes.json<{ id: string }>();
    await app.inject({ method: "POST", url: `/admin/billing/cycles/${cycleA.id}/generate`, headers: { Authorization: `Bearer ${adminTokenA}` } });

    // Society B admin cannot access society A's cycle
    const billsBRes = await app.inject({
      method: "GET",
      url: `/admin/billing/cycles/${cycleA.id}/bills`,
      headers: { Authorization: `Bearer ${adminTokenB}` },
    });
    // RLS means the bills list will be empty (not 403), since the cycle id lookup returns 0 rows
    const billsB = billsBRes.json<{ id: string }[]>();
    expect(billsB).toHaveLength(0);

    await app.close();
  });
});
