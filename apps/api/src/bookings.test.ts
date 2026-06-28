import {
  createAdminUser,
  createBillingCycle,
  createDb,
  createResident,
  createSociety,
  createTower,
  createUnit,
  findBillById,
  findRoleByName,
  runMigrations,
  createParkingSpot,
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
  unitId: string;
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
    email: `admin-bk-${Date.now()}-${Math.random()}@test.com`,
    name: "Admin",
  });
  if (!admin) throw new Error("admin creation failed");

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

  return { societyId: society.id, residentToken, residentId: resident.id, adminToken, adminId: admin.id, unitId: unit.id };
}

describe("Bookings — amenity slot reservations", () => {
  it("admin creates resource; resident books a slot", async () => {
    const ctx = await setupSociety("booking-basic");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    // Admin creates resource
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/resources",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Clubhouse", capacity: 2, description: "Main clubhouse hall" }),
    });
    expect(createRes.statusCode).toBe(201);
    const resource = createRes.json();
    expect(resource.capacity).toBe(2);

    // Resident books a slot
    const slotStart = new Date(Date.now() + 60_000).toISOString();
    const slotEnd = new Date(Date.now() + 3_600_000).toISOString();
    const bookRes = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    expect(bookRes.statusCode).toBe(201);
    const booking = bookRes.json();
    expect(booking.status).toBe("confirmed");
  });

  it("double-booking same slot same resource is rejected (409)", async () => {
    const ctx = await setupSociety("booking-conflict");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const crRes = await app.inject({
      method: "POST",
      url: "/admin/resources",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Playground", capacity: 1 }),
    });
    const resource = crRes.json();

    const slotStart = new Date(Date.now() + 60_000).toISOString();
    const slotEnd = new Date(Date.now() + 3_600_000).toISOString();

    // First booking succeeds
    const b1 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    expect(b1.statusCode).toBe(201);

    // Second booking for same slot rejected (capacity = 1)
    const b2 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    expect(b2.statusCode).toBe(409);
    expect(b2.json().error).toBe("resource_fully_booked_for_slot");
  });

  it("capacity > 1 allows multiple bookings, rejects when full", async () => {
    const ctx = await setupSociety("booking-capacity");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const crRes = await app.inject({
      method: "POST",
      url: "/admin/resources",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Tennis Court", capacity: 2 }),
    });
    const resource = crRes.json();

    const slotStart = new Date(Date.now() + 60_000).toISOString();
    const slotEnd = new Date(Date.now() + 3_600_000).toISOString();

    const b1 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    expect(b1.statusCode).toBe(201);

    const b2 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    expect(b2.statusCode).toBe(201);

    // Third booking should fail (capacity = 2, both slots taken)
    const b3 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    expect(b3.statusCode).toBe(409);
  });

  it("non-overlapping slots don't conflict", async () => {
    const ctx = await setupSociety("booking-noconflict");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const crRes = await app.inject({
      method: "POST",
      url: "/admin/resources",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Swimming Pool", capacity: 1 }),
    });
    const resource = crRes.json();

    const base = Date.now() + 60_000;
    const slot1Start = new Date(base).toISOString();
    const slot1End = new Date(base + 3_600_000).toISOString();
    const slot2Start = new Date(base + 3_600_000).toISOString();
    const slot2End = new Date(base + 7_200_000).toISOString();

    const b1 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart: slot1Start, slotEnd: slot1End }),
    });
    expect(b1.statusCode).toBe(201);

    const b2 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart: slot2Start, slotEnd: slot2End }),
    });
    expect(b2.statusCode).toBe(201);
  });

  it("resident can cancel booking; cancelled slot becomes available again", async () => {
    const ctx = await setupSociety("booking-cancel");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    const crRes = await app.inject({
      method: "POST",
      url: "/admin/resources",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Party Hall", capacity: 1 }),
    });
    const resource = crRes.json();

    const slotStart = new Date(Date.now() + 60_000).toISOString();
    const slotEnd = new Date(Date.now() + 3_600_000).toISOString();

    const b1 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    const booking = b1.json();

    // Cancel
    const cancelRes = await app.inject({
      method: "POST",
      url: `/resident/bookings/${booking.id}/cancel`,
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe("cancelled");

    // Now slot is available again
    const b2 = await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resource.id, unitId: ctx.unitId, slotStart, slotEnd }),
    });
    expect(b2.statusCode).toBe(201);
  });

  it("RLS: society A cannot see society B bookings", async () => {
    const ctxA = await setupSociety("booking-rls-A");
    const ctxB = await setupSociety("booking-rls-B");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });

    // Create resource in A
    const crRes = await app.inject({
      method: "POST",
      url: "/admin/resources",
      headers: { authorization: `Bearer ${ctxA.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Gym", capacity: 1 }),
    });
    const resourceA = crRes.json();

    // Book it
    const slotStart = new Date(Date.now() + 60_000).toISOString();
    const slotEnd = new Date(Date.now() + 3_600_000).toISOString();
    await app.inject({
      method: "POST",
      url: "/resident/bookings",
      headers: { authorization: `Bearer ${ctxA.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ resourceId: resourceA.id, unitId: ctxA.unitId, slotStart, slotEnd }),
    });

    // Society B sees its own empty list
    const listRes = await app.inject({
      method: "GET",
      url: "/admin/bookings",
      headers: { authorization: `Bearer ${ctxB.adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().length).toBe(0);
  });
});

describe("Parking allocations", () => {
  it("admin allocates an owned parking spot (no bill)", async () => {
    const ctx = await setupSociety("parking-owned");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });
    const adminDb = createDb(adminPool);

    const spot = await createParkingSpot(adminDb, {
      societyId: ctx.societyId,
      spotNo: "P-001",
      type: "car",
      isRentable: false,
    });
    if (!spot) throw new Error("spot creation failed");

    const allocRes = await app.inject({
      method: "POST",
      url: "/admin/parking-allocations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        spotId: spot.id,
        unitId: ctx.unitId,
        period: "2024-01",
        rentAmount: 0,
        startsAt: new Date().toISOString(),
      }),
    });
    expect(allocRes.statusCode).toBe(201);
    const alloc = allocRes.json();
    expect(alloc.status).toBe("active");
    expect(alloc.billId).toBeNull();
  });

  it("rentable spot creates a payable bill linked to billing cycle", async () => {
    const ctx = await setupSociety("parking-rental");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });
    const adminDb = createDb(adminPool);

    const spot = await createParkingSpot(adminDb, {
      societyId: ctx.societyId,
      spotNo: "P-RENT-01",
      type: "car",
      isRentable: true,
    });
    if (!spot) throw new Error("spot creation failed");

    // Create a billing cycle to attach the bill to
    const cycle = await tenantDb.withTenant(ctx.societyId, (db) =>
      createBillingCycle(db, {
        societyId: ctx.societyId,
        period: "2024-01",
        dueDate: "2024-01-31",
        lateFeeRule: { type: "none" },
      }),
    );
    if (!cycle) throw new Error("cycle creation failed");

    const allocRes = await app.inject({
      method: "POST",
      url: "/admin/parking-allocations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        spotId: spot.id,
        unitId: ctx.unitId,
        period: "2024-01",
        rentAmount: 1500,
        startsAt: new Date().toISOString(),
        cycleId: cycle.id,
        dueDate: "2024-01-31",
      }),
    });
    expect(allocRes.statusCode).toBe(201);
    const alloc = allocRes.json();
    expect(alloc.billId).toBeTruthy();

    // Verify the bill exists and has the right amount
    const bill = await tenantDb.withTenant(ctx.societyId, (db) => findBillById(db, alloc.billId));
    expect(bill).toBeTruthy();
    expect(bill!.totalDue).toBe(1500);
    expect(bill!.status).toBe("unpaid");
  });

  it("double-allocating the same spot is rejected (409)", async () => {
    const ctx = await setupSociety("parking-conflict");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });
    const adminDb = createDb(adminPool);

    const spot = await createParkingSpot(adminDb, {
      societyId: ctx.societyId,
      spotNo: "P-DUP-01",
      type: "car",
      isRentable: false,
    });
    if (!spot) throw new Error("spot creation failed");

    await app.inject({
      method: "POST",
      url: "/admin/parking-allocations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        spotId: spot.id,
        unitId: ctx.unitId,
        period: "2024-01",
        rentAmount: 0,
        startsAt: new Date().toISOString(),
      }),
    });

    const dup = await app.inject({
      method: "POST",
      url: "/admin/parking-allocations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        spotId: spot.id,
        unitId: ctx.unitId,
        period: "2024-02",
        rentAmount: 0,
        startsAt: new Date().toISOString(),
      }),
    });
    expect(dup.statusCode).toBe(409);
  });

  it("ending an allocation frees the spot for re-allocation", async () => {
    const ctx = await setupSociety("parking-end");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider: undefined });
    const adminDb = createDb(adminPool);

    const spot = await createParkingSpot(adminDb, {
      societyId: ctx.societyId,
      spotNo: "P-END-01",
      type: "car",
      isRentable: false,
    });
    if (!spot) throw new Error("spot creation failed");

    const a1 = await app.inject({
      method: "POST",
      url: "/admin/parking-allocations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ spotId: spot.id, unitId: ctx.unitId, period: "2024-01", rentAmount: 0, startsAt: new Date().toISOString() }),
    });
    const alloc = a1.json();

    const endRes = await app.inject({
      method: "POST",
      url: `/admin/parking-allocations/${alloc.id}/end`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(endRes.statusCode).toBe(200);
    expect(endRes.json().status).toBe("ended");

    // Can now re-allocate
    const a2 = await app.inject({
      method: "POST",
      url: "/admin/parking-allocations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ spotId: spot.id, unitId: ctx.unitId, period: "2024-02", rentAmount: 0, startsAt: new Date().toISOString() }),
    });
    expect(a2.statusCode).toBe(201);
  });
});
