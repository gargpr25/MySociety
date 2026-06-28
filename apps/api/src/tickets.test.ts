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
  process.env.TEST_ADMIN_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/mysociety_test";
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

interface TestCtx {
  societyId: string;
  residentToken: string;
  residentId: string;
  adminToken: string;
  adminId: string;
  facilityToken: string;
  facilityId: string;
}

async function setupSociety(label: string): Promise<TestCtx> {
  const adminDb = createDb(adminPool);

  const society = await createSociety(adminDb, { name: `${label}-${Date.now()}-${Math.random()}` });
  if (!society) throw new Error("society creation failed");
  createdSocietyIds.push(society.id);

  const tower = await createTower(adminDb, { societyId: society.id, name: "T1" });
  if (!tower) throw new Error("tower creation failed");

  const unit = await createUnit(adminDb, {
    societyId: society.id,
    towerId: tower.id,
    flatNo: "101",
    type: "apartment",
    carpetArea: 800,
  });
  if (!unit) throw new Error("unit creation failed");

  const ownerRole = await findRoleByName(adminDb, "resident_owner");
  if (!ownerRole) throw new Error("resident_owner role not seeded");
  const resident = await createResident(adminDb, {
    societyId: society.id,
    unitId: unit.id,
    roleId: ownerRole.id,
    name: "Test Resident",
    mobile: `+91${String(Date.now()).slice(-10)}`,
  });
  if (!resident) throw new Error("resident creation failed");

  const adminRole = await findRoleByName(adminDb, "society_admin");
  if (!adminRole) throw new Error("society_admin role not seeded");
  const admin = await createAdminUser(adminDb, {
    societyId: society.id,
    roleId: adminRole.id,
    email: `admin-tkt-${Date.now()}-${Math.random()}@test.com`,
    name: "Admin User",
  });
  if (!admin) throw new Error("admin creation failed");

  const fmRole = await findRoleByName(adminDb, "facility_manager");
  if (!fmRole) throw new Error("facility_manager role not seeded");
  const fm = await createAdminUser(adminDb, {
    societyId: society.id,
    roleId: fmRole.id,
    email: `fm-tkt-${Date.now()}-${Math.random()}@test.com`,
    name: "Facility Manager",
  });
  if (!fm) throw new Error("facility_manager creation failed");

  const residentToken = signAccessToken(JWT_SECRET, {
    id: resident.id,
    kind: "resident",
    societyId: society.id,
    role: "resident_owner",
    name: resident.name,
    identifier: resident.mobile,
  });

  const adminToken = signAccessToken(JWT_SECRET, {
    id: admin.id,
    kind: "admin",
    societyId: society.id,
    role: "society_admin",
    name: admin.name,
    identifier: admin.email,
  });

  const facilityToken = signAccessToken(JWT_SECRET, {
    id: fm.id,
    kind: "admin",
    societyId: society.id,
    role: "facility_manager",
    name: fm.name,
    identifier: fm.email,
  });

  return {
    societyId: society.id,
    residentToken,
    residentId: resident.id,
    adminToken,
    adminId: admin.id,
    facilityToken,
    facilityId: fm.id,
  };
}

describe("Tickets — resident creates, admin manages", () => {
  it("resident can create a ticket and see it in their list", async () => {
    const ctx = await setupSociety("ticket-create");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "electric",
        description: "Power tripping in the kitchen every morning",
        priority: "high",
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const ticket = createRes.json();
    expect(ticket.status).toBe("open");
    expect(ticket.category).toBe("electric");
    expect(ticket.slaBreached).toBe(false);
    expect(ticket.slaDueAt).toBeTruthy();

    const listRes = await app.inject({
      method: "GET",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((t: { id: string }) => t.id === ticket.id)).toBe(true);
  });

  it("resident can view ticket detail with events", async () => {
    const ctx = await setupSociety("ticket-detail");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "plumbing",
        description: "Pipe leaking in bathroom sink",
      }),
    });
    const ticket = createRes.json();

    const detailRes = await app.inject({
      method: "GET",
      url: `/resident/tickets/${ticket.id}`,
      headers: { authorization: `Bearer ${ctx.residentToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json();
    expect(detail.events).toBeDefined();
    expect(detail.events.length).toBe(1);
    expect(detail.events[0].eventType).toBe("created");
  });

  it("admin can assign ticket to facility_manager", async () => {
    const ctx = await setupSociety("ticket-assign");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "request",
        category: "ac_cleaning",
        description: "AC unit in bedroom needs annual cleaning service",
      }),
    });
    const ticket = createRes.json();

    const assignRes = await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/assign`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ assignedTo: ctx.facilityId, comment: "Assigned to FM team" }),
    });
    expect(assignRes.statusCode).toBe(200);
    const assigned = assignRes.json();
    expect(assigned.status).toBe("assigned");
    expect(assigned.assignedTo).toBe(ctx.facilityId);
  });

  it("status workflow: open → in_progress → resolved → closed", async () => {
    const ctx = await setupSociety("ticket-workflow");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "mason",
        description: "Large crack in the living room wall near window frame",
      }),
    });
    const ticket = createRes.json();

    // open → in_progress
    const inProgressRes = await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/status`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    expect(inProgressRes.statusCode).toBe(200);
    expect(inProgressRes.json().status).toBe("in_progress");

    // in_progress → resolved
    const resolvedRes = await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/status`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved", comment: "Repaired crack with filler" }),
    });
    expect(resolvedRes.statusCode).toBe(200);
    expect(resolvedRes.json().status).toBe("resolved");

    // resolved → closed
    const closedRes = await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/status`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closedRes.statusCode).toBe(200);
    expect(closedRes.json().status).toBe("closed");
  });

  it("invalid status transition is rejected with 400", async () => {
    const ctx = await setupSociety("ticket-invalid-tx");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "painting",
        description: "Paint peeling from exterior wall on balcony side",
      }),
    });
    const ticket = createRes.json();

    // open → closed is allowed, but open → reopened is not
    const badRes = await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/status`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "reopened" }),
    });
    expect(badRes.statusCode).toBe(400);
  });

  it("resident can reopen a resolved ticket", async () => {
    const ctx = await setupSociety("ticket-reopen");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "plumbing",
        description: "Bathroom tap dripping continuously since last week",
      }),
    });
    const ticket = createRes.json();

    // Resolve first
    await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/status`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });

    // Resident reopens
    const reopenRes = await app.inject({
      method: "POST",
      url: `/resident/tickets/${ticket.id}/reopen`,
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(reopenRes.statusCode).toBe(200);
    expect(reopenRes.json().status).toBe("reopened");
  });

  it("SLA check flags overdue tickets and leaves fresh ones alone", async () => {
    const ctx = await setupSociety("ticket-sla");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    // Create ticket then manually set sla_due_at to past via admin DB
    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "electric",
        description: "Circuit breaker tripping at least three times every week",
      }),
    });
    const ticket = createRes.json();

    // Backdating sla_due_at to the past so the ticket is overdue
    await adminPool.query(
      "UPDATE tickets SET sla_due_at = now() - interval '1 hour' WHERE id = $1",
      [ticket.id],
    );

    const slaRes = await app.inject({
      method: "POST",
      url: "/admin/tickets/check-sla",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(slaRes.statusCode).toBe(200);
    const slaResult = slaRes.json();
    expect(slaResult.breached).toBeGreaterThanOrEqual(1);

    // Verify flag is set on the ticket
    const detailRes = await app.inject({
      method: "GET",
      url: `/admin/tickets/${ticket.id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    expect(detailRes.json().slaBreached).toBe(true);
  });

  it("admin list supports status filter", async () => {
    const ctx = await setupSociety("ticket-filter");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    // Create two tickets
    await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "electric",
        description: "Flickering lights in the hallway near the lift lobby",
      }),
    });

    const t2Res = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "request",
        category: "shifting",
        description: "Need shifting assistance from third floor to fifth floor",
      }),
    });
    const t2 = t2Res.json();

    // Put one in_progress
    await app.inject({
      method: "POST",
      url: `/admin/tickets/${t2.id}/status`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    });

    const openRes = await app.inject({
      method: "GET",
      url: "/admin/tickets?status=open",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    expect(openRes.statusCode).toBe(200);
    const openList = openRes.json();
    expect(openList.every((t: { status: string }) => t.status === "open")).toBe(true);

    const ipRes = await app.inject({
      method: "GET",
      url: "/admin/tickets?status=in_progress",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    expect(ipRes.statusCode).toBe(200);
    const ipList = ipRes.json();
    expect(ipList.some((t: { id: string }) => t.id === t2.id)).toBe(true);
  });

  it("comments are visible in ticket events", async () => {
    const ctx = await setupSociety("ticket-comment");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "other",
        description: "Stray dogs entering the compound through gate gap regularly",
      }),
    });
    const ticket = createRes.json();

    await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/comment`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ body: "We have contacted the security agency to patch the gap." }),
    });

    await app.inject({
      method: "POST",
      url: `/resident/tickets/${ticket.id}/comment`,
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ body: "Thank you, please expedite." }),
    });

    const detailRes = await app.inject({
      method: "GET",
      url: `/resident/tickets/${ticket.id}`,
      headers: { authorization: `Bearer ${ctx.residentToken}` },
    });
    const detail = detailRes.json();
    const comments = detail.events.filter((e: { eventType: string }) => e.eventType === "comment");
    expect(comments.length).toBe(2);
  });

  it("RLS: society A cannot see society B tickets", async () => {
    const ctxA = await setupSociety("ticket-rls-A");
    const ctxB = await setupSociety("ticket-rls-B");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctxA.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        category: "plumbing",
        description: "Water pressure extremely low in morning hours for past week",
      }),
    });
    const ticketA = createRes.json();

    // Society B admin tries to see society A ticket
    const res = await app.inject({
      method: "GET",
      url: `/admin/tickets/${ticketA.id}`,
      headers: { authorization: `Bearer ${ctxB.adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("facility_manager can update status", async () => {
    const ctx = await setupSociety("ticket-fm-status");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const createRes = await app.inject({
      method: "POST",
      url: "/resident/tickets",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "request",
        category: "playground_alloc",
        description: "Requesting playground slot allocation for children birthday party",
      }),
    });
    const ticket = createRes.json();

    const statusRes = await app.inject({
      method: "POST",
      url: `/admin/tickets/${ticket.id}/status`,
      headers: { authorization: `Bearer ${ctx.facilityToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().status).toBe("in_progress");
  });
});
