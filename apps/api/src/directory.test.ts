import {
  createAdminUser,
  createDb,
  createResident,
  createSociety,
  createTower,
  createUnit,
  findRoleByName,
  findUnitResident,
  runMigrations,
  withTenantContext,
  type Database,
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

function uniqueMobile(): string {
  return `9${Math.floor(100_000_000 + Math.random() * 800_000_000)}`;
}

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
    email: `admin-${Date.now()}-${Math.random()}@example.com`,
    name: "Test Admin",
  });
  if (!admin) throw new Error("failed to create admin");

  const accessToken = signAccessToken(JWT_SECRET, {
    id: admin.id,
    kind: "admin",
    societyId: society.id,
    role: "society_admin",
    name: admin.name,
    identifier: admin.email,
  });

  return { society, admin, accessToken };
}

function buildTestApp() {
  return buildApp({ tenantDb, jwtSecret: JWT_SECRET });
}

function multipartCsvPayload(csv: string) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "import.csv");
  return form;
}

const VALID_CSV = [
  "tower,flat_no,carpet_area,owner_name,owner_mobile,tenant_name,tenant_mobile,parking_spots",
  `Tower 1,101,950,Asha Sharma,${uniqueMobile()},,,P-101`,
].join("\n");

describe("CSV directory import", () => {
  it("dryRun never writes, and reports the expected would-create counts", async () => {
    const { society, accessToken } = await setupSociety("CSV Dry Run Society");
    const app = buildTestApp();
    const ownerMobile = uniqueMobile();
    const csv = [
      "tower,flat_no,carpet_area,owner_name,owner_mobile,tenant_name,tenant_mobile,parking_spots",
      `Tower 1,101,950,Asha Sharma,${ownerMobile},,,P-101`,
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: "/admin/residents/import?dryRun=true",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: multipartCsvPayload(csv),
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.applied).toBe(false);
    expect(report.errors).toHaveLength(0);
    expect(report.wouldCreateUnits).toBe(1);
    expect(report.wouldCreateResidents).toBe(1);
    expect(report.wouldCreateUnitResidents).toBe(1);
    expect(report.wouldCreateParkingSpots).toBe(1);

    await withTenantContext(tenantDb.db, society.id, async (tx) => {
      const towers = await import("@mysociety/db").then((m) => m.listTowers(tx));
      expect(towers).toHaveLength(0);
    });

    await app.close();
  });

  it("applies a valid import and creates the expected rows", async () => {
    const { society, accessToken } = await setupSociety("CSV Valid Import Society");
    const app = buildTestApp();
    const ownerMobile = uniqueMobile();
    const csv = [
      "tower,flat_no,carpet_area,owner_name,owner_mobile,tenant_name,tenant_mobile,parking_spots",
      `Tower 1,101,950,Asha Sharma,${ownerMobile},,,P-101`,
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: "/admin/residents/import?dryRun=false",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: multipartCsvPayload(csv),
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.applied).toBe(true);
    expect(report.errors).toHaveLength(0);

    await withTenantContext(tenantDb.db, society.id, async (tx) => {
      const { listTowers, listUnits, findResidentByMobile } = await import("@mysociety/db");
      const towers = await listTowers(tx);
      const units = await listUnits(tx);
      expect(towers).toHaveLength(1);
      expect(units).toHaveLength(1);
      const resident = await findResidentByMobile(tx, ownerMobile);
      expect(resident?.name).toBe("Asha Sharma");
    });

    // Re-running the same import is idempotent: nothing new to create.
    const secondRes = await app.inject({
      method: "POST",
      url: "/admin/residents/import?dryRun=false",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: multipartCsvPayload(csv),
    });
    const secondReport = secondRes.json();
    expect(secondReport.wouldCreateUnits).toBe(0);
    expect(secondReport.wouldCreateResidents).toBe(0);
    expect(secondReport.wouldCreateUnitResidents).toBe(0);
    expect(secondReport.wouldCreateParkingSpots).toBe(0);

    await app.close();
  });

  it("reports a malformed row without aborting the rest of the file in dryRun", async () => {
    const { accessToken } = await setupSociety("CSV Malformed Row Society");
    const app = buildTestApp();
    const goodMobile = uniqueMobile();
    const csv = [
      "tower,flat_no,carpet_area,owner_name,owner_mobile,tenant_name,tenant_mobile,parking_spots",
      `Tower 1,101,950,Asha Sharma,${goodMobile},,,`,
      "Tower 1,102,not-a-number,Bad Row,123,,,",
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: "/admin/residents/import?dryRun=true",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: multipartCsvPayload(csv),
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.applied).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0].row).toBe(2);
    // The good row (row 1) is still counted even though row 2 is bad.
    expect(report.wouldCreateUnits).toBe(1);
    expect(report.wouldCreateResidents).toBe(1);

    await app.close();
  });

  it("never applies any rows when the file contains an error, even in confirm mode", async () => {
    const { society, accessToken } = await setupSociety("CSV Abort On Error Society");
    const app = buildTestApp();
    const csv = [
      "tower,flat_no,carpet_area,owner_name,owner_mobile,tenant_name,tenant_mobile,parking_spots",
      `Tower 1,101,950,Asha Sharma,${uniqueMobile()},,,`,
      "Tower 1,102,not-a-number,Bad Row,123,,,",
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: "/admin/residents/import?dryRun=false",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: multipartCsvPayload(csv),
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.applied).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);

    await withTenantContext(tenantDb.db, society.id, async (tx) => {
      const { listUnits } = await import("@mysociety/db");
      const units = await listUnits(tx);
      expect(units).toHaveLength(0);
    });

    await app.close();
  });

  it("handles a landlord mobile that owns multiple units", async () => {
    const { society, accessToken } = await setupSociety("CSV Landlord Society");
    const app = buildTestApp();
    const landlordMobile = uniqueMobile();
    const csv = [
      "tower,flat_no,carpet_area,owner_name,owner_mobile,tenant_name,tenant_mobile,parking_spots",
      `Tower 1,101,950,Landlord Lakshmi,${landlordMobile},,,`,
      `Tower 1,102,1250,Landlord Lakshmi,${landlordMobile},,,`,
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: "/admin/residents/import?dryRun=false",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: multipartCsvPayload(csv),
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.applied).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.wouldCreateUnits).toBe(2);
    expect(report.wouldCreateResidents).toBe(1);
    expect(report.wouldCreateUnitResidents).toBe(2);

    await withTenantContext(tenantDb.db, society.id, async (tx) => {
      const { findResidentByMobile, listUnits } = await import("@mysociety/db");
      const resident = await findResidentByMobile(tx, landlordMobile);
      expect(resident).toBeDefined();
      const units = await listUnits(tx);
      expect(units).toHaveLength(2);
      for (const unit of units) {
        const link = await findUnitResident(tx, unit.id, resident!.id);
        expect(link).toBeDefined();
      }
    });

    await app.close();
  });

  it("rejects a mobile reused with a conflicting name", async () => {
    const { accessToken } = await setupSociety("CSV Conflicting Name Society");
    const app = buildTestApp();
    const mobile = uniqueMobile();
    const csv = [
      "tower,flat_no,carpet_area,owner_name,owner_mobile,tenant_name,tenant_mobile,parking_spots",
      `Tower 1,101,950,Asha Sharma,${mobile},,,`,
      `Tower 1,102,950,Someone Else,${mobile},,,`,
    ].join("\n");

    const res = await app.inject({
      method: "POST",
      url: "/admin/residents/import?dryRun=true",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: multipartCsvPayload(csv),
    });

    const report = res.json();
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors.some((e: { message: string }) => e.message.includes("conflicting names"))).toBe(true);
  });
});

describe("admin units CRUD", () => {
  it("rejects non-admin roles", async () => {
    const app = buildTestApp();
    const token = signAccessToken(JWT_SECRET, {
      id: "00000000-0000-0000-0000-000000000000",
      kind: "resident",
      societyId: "00000000-0000-0000-0000-000000000000",
      role: "resident_owner",
      name: "Resident",
      identifier: "9999999999",
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/units",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("lists, creates, and fetches unit detail with linked residents and parking", async () => {
    const { society, accessToken } = await setupSociety("Admin Units CRUD Society");
    const app = buildTestApp();

    const createRes = await app.inject({
      method: "POST",
      url: "/admin/units",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { towerId: (await createTestTower(society.id)).id, flatNo: "201", type: "2bhk", carpetArea: 900 },
    });
    expect(createRes.statusCode).toBe(201);
    const unit = createRes.json();

    const listRes = await app.inject({
      method: "GET",
      url: "/admin/units",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);

    const addResidentRes = await app.inject({
      method: "POST",
      url: `/admin/units/${unit.id}/residents`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "New Resident", mobile: uniqueMobile(), relationship: "owner", isPrimary: true },
    });
    expect(addResidentRes.statusCode).toBe(201);

    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/units/${unit.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json();
    expect(detail.unitResidents).toHaveLength(1);

    await app.close();

    async function createTestTower(societyId: string) {
      return withTenantContext(tenantDb.db, societyId, (tx: Database) =>
        createTower(tx, { societyId, name: "CRUD Tower" }),
      ).then((t) => {
        if (!t) throw new Error("failed to create tower");
        return t;
      });
    }
  });

  it("returns 404 for a unit in another tenant", async () => {
    const a = await setupSociety("Cross Tenant A");
    const b = await setupSociety("Cross Tenant B");
    const app = buildTestApp();

    const tower = await withTenantContext(tenantDb.db, b.society.id, (tx) =>
      createTower(tx, { societyId: b.society.id, name: "B Tower" }),
    );
    if (!tower) throw new Error("failed to create tower");
    const unit = await withTenantContext(tenantDb.db, b.society.id, (tx) =>
      createUnit(tx, { societyId: b.society.id, towerId: tower.id, flatNo: "B1", type: "2bhk", carpetArea: 900 }),
    );
    if (!unit) throw new Error("failed to create unit");

    const res = await app.inject({
      method: "GET",
      url: `/admin/units/${unit.id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
