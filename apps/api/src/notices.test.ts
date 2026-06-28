import {
  createAdminUser,
  createDb,
  createNotice,
  createResident,
  createSociety,
  createTower,
  createUnit,
  findRoleByName,
  runMigrations,
  withTenantContext,
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
    email: `admin-${Date.now()}-${Math.random()}@test.com`,
    name: "Test Admin",
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

async function setupResident(
  societyId: string,
  roleName: "resident_owner" | "resident_tenant" | "resident_family",
) {
  const adminDb = createDb(adminPool);
  const role = await findRoleByName(adminDb, roleName);
  if (!role) throw new Error(`${roleName} role not seeded`);

  return tenantDb.withTenant(societyId, async (tx) => {
    const tower = await createTower(tx, { societyId, name: `Tower-${Date.now()}` });
    if (!tower) throw new Error("failed to create tower");
    const unit = await createUnit(tx, {
      societyId,
      towerId: tower.id,
      flatNo: `${Math.floor(100 + Math.random() * 900)}`,
      type: "2bhk",
      carpetArea: 900,
    });
    if (!unit) throw new Error("failed to create unit");
    const resident = await createResident(tx, {
      societyId,
      unitId: unit.id,
      roleId: role.id,
      name: "Test Resident",
      mobile: uniqueMobile(),
    });
    if (!resident) throw new Error("failed to create resident");

    const token = signAccessToken(JWT_SECRET, {
      id: resident.id,
      kind: "resident",
      societyId,
      role: roleName,
      name: resident.name,
      identifier: resident.mobile,
    });

    return { resident, token };
  });
}

describe("Notice board API", () => {
  it("admin can create and list notices", async () => {
    const { adminToken } = await setupSociety("Notices CRUD");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const createRes = await app.inject({
      method: "POST",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Water Shutdown", body: "No water Sunday 10am–2pm", audience: "all" }),
    });
    expect(createRes.statusCode).toBe(201);
    const notice = createRes.json<{ id: string; title: string }>();
    expect(notice.title).toBe("Water Shutdown");

    const listRes = await app.inject({
      method: "GET",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const notices = listRes.json<{ id: string }[]>();
    expect(notices.some((n) => n.id === notice.id)).toBe(true);

    await app.close();
  });

  it("admin can update and delete a notice", async () => {
    const { adminToken } = await setupSociety("Notices Update Delete");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const createRes = await app.inject({
      method: "POST",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Old Title", body: "Old body", audience: "all" }),
    });
    const { id } = createRes.json<{ id: string }>();

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/admin/notices/${id}`,
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json<{ title: string }>().title).toBe("New Title");

    const delRes = await app.inject({
      method: "DELETE",
      url: `/admin/notices/${id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(204);

    await app.close();
  });

  it("audience targeting: owner sees 'all' and 'owners' but not 'tenants'", async () => {
    const { society, adminToken } = await setupSociety("Notices Audience");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    for (const [title, audience] of [
      ["All Notice", "all"],
      ["Owners Notice", "owners"],
      ["Tenants Notice", "tenants"],
    ]) {
      await app.inject({
        method: "POST",
        url: "/admin/notices",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: "body", audience }),
      });
    }

    const { token: ownerToken } = await setupResident(society.id, "resident_owner");
    const ownerRes = await app.inject({
      method: "GET",
      url: "/resident/notices",
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
    const ownerTitles = ownerRes.json<{ title: string }[]>().map((n) => n.title);
    expect(ownerTitles).toContain("All Notice");
    expect(ownerTitles).toContain("Owners Notice");
    expect(ownerTitles).not.toContain("Tenants Notice");

    const { token: tenantToken } = await setupResident(society.id, "resident_tenant");
    const tenantRes = await app.inject({
      method: "GET",
      url: "/resident/notices",
      headers: { Authorization: `Bearer ${tenantToken}` },
    });
    const tenantTitles = tenantRes.json<{ title: string }[]>().map((n) => n.title);
    expect(tenantTitles).toContain("All Notice");
    expect(tenantTitles).toContain("Tenants Notice");
    expect(tenantTitles).not.toContain("Owners Notice");

    await app.close();
  });

  it("publish/expiry filtering: future notice hidden, expired notice hidden", async () => {
    const { society, adminToken } = await setupSociety("Notices Timing");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();

    await app.inject({
      method: "POST",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Active Notice", body: "body", audience: "all", publishAt: past }),
    });
    await app.inject({
      method: "POST",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Future Notice", body: "body", audience: "all", publishAt: future }),
    });
    await app.inject({
      method: "POST",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Expired Notice", body: "body", audience: "all", publishAt: past, expiresAt: past }),
    });

    const { token } = await setupResident(society.id, "resident_owner");
    const res = await app.inject({
      method: "GET",
      url: "/resident/notices",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json<{ title: string }[]>().map((n) => n.title);
    expect(titles).toContain("Active Notice");
    expect(titles).not.toContain("Future Notice");
    expect(titles).not.toContain("Expired Notice");

    await app.close();
  });

  it("RLS: notices from society A are not visible to society B residents", async () => {
    const { adminToken: adminTokenA } = await setupSociety("Notices RLS A");
    const { society: societyB } = await setupSociety("Notices RLS B");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${adminTokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Society A Secret", body: "body", audience: "all" }),
    });

    const { token: tokenB } = await setupResident(societyB.id, "resident_owner");
    const res = await app.inject({
      method: "GET",
      url: "/resident/notices",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json<{ title: string }[]>().map((n) => n.title);
    expect(titles).not.toContain("Society A Secret");

    await app.close();
  });

  it("non-admin cannot create notices", async () => {
    const { society } = await setupSociety("Notices RBAC");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const { token } = await setupResident(society.id, "resident_owner");
    const res = await app.inject({
      method: "POST",
      url: "/admin/notices",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hack", body: "body", audience: "all" }),
    });
    expect(res.statusCode).toBe(403);

    await app.close();
  });
});
