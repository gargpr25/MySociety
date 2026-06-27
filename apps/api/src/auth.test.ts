import {
  createAdminUser,
  createDb,
  createResident,
  createSociety,
  findRoleByName,
  runMigrations,
  withTenantContext,
  type Database,
} from "@mysociety/db";
import type { SmsProvider } from "@mysociety/config";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTenantAwareDb, type TenantAwareDb } from "./db.js";

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mysociety_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

const JWT_SECRET = "test-jwt-secret-at-least-16-chars";

class RecordingSmsProvider implements SmsProvider {
  sent: Array<{ destination: string; code: string }> = [];
  async sendOtp(destination: string, code: string): Promise<void> {
    this.sent.push({ destination, code });
  }
  lastCodeFor(destination: string): string {
    const match = [...this.sent].reverse().find((s) => s.destination === destination);
    if (!match) throw new Error(`No OTP recorded for ${destination}`);
    return match.code;
  }
}

let adminPool: Pool;
let tenantDb: TenantAwareDb;
let smsProvider: RecordingSmsProvider;
const createdSocietyIds: string[] = [];

// Date.now() alone collides easily across calls a few ms apart once
// truncated to fit the 15-digit mobile format; pad with randomness instead.
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

async function seedResident(mobile: string, isPrimary = true) {
  const adminDb = createDb(adminPool);
  const society = await createSociety(adminDb, { name: `Auth Test Society ${Date.now()}-${Math.random()}` });
  if (!society) throw new Error("failed to create society");
  createdSocietyIds.push(society.id);
  const role = await findRoleByName(adminDb, "resident_owner");
  if (!role) throw new Error("resident_owner role not seeded");
  await withTenantContext(tenantDb.db, society.id, async (tx: Database) => {
    await createResident(tx, { societyId: society.id, roleId: role.id, name: "Test Resident", mobile, isPrimary });
  });
  return society;
}

async function seedAdmin(email: string) {
  const adminDb = createDb(adminPool);
  const society = await createSociety(adminDb, { name: `Auth Test Admin Society ${Date.now()}-${Math.random()}` });
  if (!society) throw new Error("failed to create society");
  createdSocietyIds.push(society.id);
  const role = await findRoleByName(adminDb, "society_admin");
  if (!role) throw new Error("society_admin role not seeded");
  await createAdminUser(adminDb, { societyId: society.id, roleId: role.id, email, name: "Test Admin" });
  return society;
}

function buildTestApp() {
  smsProvider = new RecordingSmsProvider();
  return buildApp({ tenantDb, jwtSecret: JWT_SECRET, smsProvider });
}

describe("resident OTP login", () => {
  it("supports the request -> verify -> /me happy path", async () => {
    const mobile = uniqueMobile();
    const society = await seedResident(mobile);
    const app = buildTestApp();

    const requestRes = await app.inject({ method: "POST", url: "/auth/otp/request", payload: { mobile } });
    expect(requestRes.statusCode).toBe(200);

    const code = smsProvider.lastCodeFor(mobile);
    const verifyRes = await app.inject({ method: "POST", url: "/auth/otp/verify", payload: { mobile, code } });
    expect(verifyRes.statusCode).toBe(200);
    const { accessToken } = verifyRes.json();
    expect(accessToken).toBeTypeOf("string");

    const meRes = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${accessToken}` } });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json()).toMatchObject({ kind: "resident", societyId: society.id, role: "resident_owner" });

    await app.close();
  });

  it("rejects an invalid OTP code", async () => {
    const mobile = uniqueMobile();
    await seedResident(mobile);
    const app = buildTestApp();

    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { mobile } });
    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { mobile, code: "000000" },
    });
    expect(verifyRes.statusCode).toBe(401);

    await app.close();
  });

  it("rejects an expired OTP code", async () => {
    const mobile = uniqueMobile();
    await seedResident(mobile);
    const app = buildTestApp();

    await app.inject({ method: "POST", url: "/auth/otp/request", payload: { mobile } });
    const code = smsProvider.lastCodeFor(mobile);
    // Force-expire the OTP request directly, bypassing the app's TTL.
    await adminPool.query(
      "UPDATE otp_requests SET expires_at = now() - interval '1 minute' WHERE identifier = $1",
      [mobile],
    );

    const verifyRes = await app.inject({ method: "POST", url: "/auth/otp/verify", payload: { mobile, code } });
    expect(verifyRes.statusCode).toBe(401);
    expect(verifyRes.json()).toMatchObject({ error: "expired" });

    await app.close();
  });

  it("rate limits repeated OTP requests for the same mobile", async () => {
    const mobile = uniqueMobile();
    await seedResident(mobile);
    const app = buildTestApp();

    let lastStatus = 200;
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({ method: "POST", url: "/auth/otp/request", payload: { mobile } });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);

    await app.close();
  });

  it("returns 401 from /me without a token", async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("does not reveal whether a mobile number is registered", async () => {
    const app = buildTestApp();
    const unknownMobile = uniqueMobile();
    const res = await app.inject({ method: "POST", url: "/auth/otp/request", payload: { mobile: unknownMobile } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
    await app.close();
  });
});

describe("admin OTP login", () => {
  it("supports the request -> verify -> /me happy path and resolves the correct society_id", async () => {
    const email = `admin-${Date.now()}@example.com`;
    const society = await seedAdmin(email);
    const app = buildTestApp();

    await app.inject({ method: "POST", url: "/auth/admin/login/request", payload: { email } });
    const code = smsProvider.lastCodeFor(email);
    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/admin/login/verify",
      payload: { email, code },
    });
    expect(verifyRes.statusCode).toBe(200);
    const { accessToken } = verifyRes.json();

    const meRes = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${accessToken}` } });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json()).toMatchObject({ kind: "admin", societyId: society.id, role: "society_admin" });

    await app.close();
  });
});
