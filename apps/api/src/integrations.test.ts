import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAdminUser,
  createDb,
  createIntegrationConfig,
  createSociety,
  createTower,
  createUnit,
  findRoleByName,
  runMigrations,
} from "@mysociety/db";
import { encryptValue, decryptValue } from "@mysociety/config";
import type { CanonicalEvent } from "@mysociety/types";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { signAccessToken } from "./auth/jwt.js";
import { createTenantAwareDb, type TenantAwareDb } from "./db.js";
import { createDispatcher } from "./connectors/dispatcher.js";
import { dispatchWebhook } from "./connectors/webhook.js";
import { dispatchCsvExport } from "./connectors/csv-export.js";

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/mysociety_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

const JWT_SECRET = "test-jwt-secret-at-least-16-chars";
// 32-byte AES-256 key (64 hex chars)
const ENCRYPTION_KEY = randomBytes(32).toString("hex");

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
  adminToken: string;
}

async function setupSociety(label: string): Promise<TestCtx> {
  const adminDb = createDb(adminPool);
  const society = await createSociety(adminDb, { name: `${label}-${Date.now()}-${Math.random()}` });
  if (!society) throw new Error("society creation failed");
  createdSocietyIds.push(society.id);

  const tower = await createTower(adminDb, { societyId: society.id, name: "T1" });
  if (!tower) throw new Error("tower creation failed");

  await createUnit(adminDb, {
    societyId: society.id,
    towerId: tower.id,
    flatNo: "101",
    type: "apartment",
    carpetArea: 800,
  });

  const adminRoleRow = await findRoleByName(adminDb, "society_admin");
  if (!adminRoleRow) throw new Error("society_admin role not found");

  const admin = await createAdminUser(adminDb, {
    societyId: society.id,
    roleId: adminRoleRow.id,
    email: `admin-${Date.now()}@example.com`,
    name: "Admin",
    passwordHash: "x",
  });

  const adminToken = signAccessToken(JWT_SECRET, {
    id: admin.id,
    role: "society_admin",
    societyId: society.id,
  });

  return { societyId: society.id, adminToken };
}

// ── Encryption unit tests ───────────────────────────────────────────────────

describe("encryptValue / decryptValue", () => {
  it("round-trips plaintext", () => {
    const secret = JSON.stringify({ url: "https://example.com", secret: "s3cr3t" });
    const ciphertext = encryptValue(secret, ENCRYPTION_KEY);
    expect(ciphertext).not.toContain("example.com");
    expect(ciphertext).not.toContain("s3cr3t");
    expect(decryptValue(ciphertext, ENCRYPTION_KEY)).toBe(secret);
  });

  it("encrypted value never contains plaintext", () => {
    const secret = "super-secret-api-key-12345";
    const ciphertext = encryptValue(secret, ENCRYPTION_KEY);
    expect(ciphertext).not.toContain(secret);
  });
});

// ── Webhook connector ───────────────────────────────────────────────────────

describe("webhook connector", () => {
  it("dispatches event with HMAC signature", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );

    const event: CanonicalEvent = {
      type: "ticket.created",
      societyId: "00000000-0000-0000-0000-000000000001",
      ticketId: "00000000-0000-0000-0000-000000000002",
      category: "plumbing",
      ticketType: "complaint",
      unitId: null,
    };

    await dispatchWebhook(event, { url: "https://webhook.example.com/hook", secret: "my-secret" }, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://webhook.example.com/hook");
    expect((init?.headers as Record<string, string>)["X-Signature-256"]).toMatch(/^sha256=/);
    fetchMock.mockRestore();
  });

  it("applies field mappings before sending", async () => {
    let sentBody = "";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      sentBody = init?.body as string;
      return new Response(null, { status: 200 });
    });

    const event: CanonicalEvent = {
      type: "ticket.created",
      societyId: "s1",
      ticketId: "t1",
      category: "electrical",
      ticketType: "complaint",
      unitId: null,
    };

    await dispatchWebhook(event, { url: "https://x.example.com" }, { ticketId: "TicketNumber", category: "Department" });

    const parsed = JSON.parse(sentBody) as Record<string, unknown>;
    expect(parsed["TicketNumber"]).toBe("t1");
    expect(parsed["Department"]).toBe("electrical");
    expect(parsed["ticketId"]).toBeUndefined();
    fetchMock.mockRestore();
  });

  it("retries on transient failure and succeeds", async () => {
    let attempts = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempts++;
      if (attempts < 3) throw new Error("Network error");
      return new Response(null, { status: 200 });
    });

    const event: CanonicalEvent = {
      type: "payment.captured",
      societyId: "s1",
      paymentId: "p1",
      residentId: "r1",
      amountRupees: 500,
    };

    await dispatchWebhook(event, { url: "https://x.example.com" }, {}, 3);
    expect(attempts).toBe(3);
    fetchMock.mockRestore();
  });

  it("throws after exhausting all retries", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Always fails"));

    await expect(
      dispatchWebhook(
        { type: "payment.captured", societyId: "s1", paymentId: "p1", residentId: "r1", amountRupees: 100 },
        { url: "https://x.example.com" },
        {},
        2,
      ),
    ).rejects.toThrow("Always fails");

    fetchMock.mockRestore();
  });
});

// ── CSV export connector ────────────────────────────────────────────────────

describe("csv_export connector", () => {
  it("writes CSV with header + row to a new file", async () => {
    const path = join(tmpdir(), `mysociety-test-${Date.now()}.csv`);
    const event: CanonicalEvent = {
      type: "bill.generated",
      societyId: "s1",
      billId: "b1",
      unitId: "u1",
      cycleId: "c1",
      period: "2024-01",
      totalDue: 2500,
    };

    await dispatchCsvExport(event, { path }, {});

    const content = await readFile(path, "utf8");
    expect(content).toContain("type,societyId,billId");
    expect(content).toContain("bill.generated");
    expect(content).toContain("2500");

    await rm(path, { force: true });
  });

  it("applies field mappings in CSV output", async () => {
    const path = join(tmpdir(), `mysociety-test-mapping-${Date.now()}.csv`);
    const event: CanonicalEvent = {
      type: "bill.generated",
      societyId: "s1",
      billId: "b2",
      unitId: "u1",
      cycleId: "c1",
      period: "2024-01",
      totalDue: 1000,
    };

    await dispatchCsvExport(event, { path }, { billId: "InvoiceNo", totalDue: "Amount" });

    const content = await readFile(path, "utf8");
    expect(content).toContain("InvoiceNo");
    expect(content).toContain("Amount");
    expect(content).not.toContain("billId");

    await rm(path, { force: true });
  });
});

// ── Dispatcher + RLS ────────────────────────────────────────────────────────

describe("dispatcher", () => {
  it("dispatches only to configs with the matching event type enabled", async () => {
    const ctx = await setupSociety("dispatcher-filter");

    const encryptedCreds = encryptValue(
      JSON.stringify({ url: "https://hook.example.com", secret: "sec" }),
      ENCRYPTION_KEY,
    );

    await tenantDb.withTenant(ctx.societyId, (db) =>
      createIntegrationConfig(db, {
        societyId: ctx.societyId,
        connectorType: "generic_webhook",
        encryptedCredentials: encryptedCreds,
        enabledEvents: ["ticket.created"],
      }),
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const dispatch = createDispatcher(tenantDb, ENCRYPTION_KEY);

    // "ticket.created" is enabled → should dispatch
    await dispatch({
      type: "ticket.created",
      societyId: ctx.societyId,
      ticketId: "t1",
      category: "plumbing",
      ticketType: "complaint",
      unitId: null,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockClear();

    // "bill.generated" is NOT enabled for this config → should NOT dispatch
    await dispatch({
      type: "bill.generated",
      societyId: ctx.societyId,
      billId: "b1",
      unitId: "u1",
      cycleId: "c1",
      period: "2024-01",
      totalDue: 5000,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("RLS: society A config is not visible when dispatching for society B", async () => {
    const ctxA = await setupSociety("rls-society-a");
    const ctxB = await setupSociety("rls-society-b");

    // Create config for society A
    const encryptedCreds = encryptValue(
      JSON.stringify({ url: "https://hook-a.example.com" }),
      ENCRYPTION_KEY,
    );
    await tenantDb.withTenant(ctxA.societyId, (db) =>
      createIntegrationConfig(db, {
        societyId: ctxA.societyId,
        connectorType: "generic_webhook",
        encryptedCredentials: encryptedCreds,
        enabledEvents: ["ticket.created"],
      }),
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const dispatch = createDispatcher(tenantDb, ENCRYPTION_KEY);

    // Dispatch event for society B — should NOT call society A's webhook
    await dispatch({
      type: "ticket.created",
      societyId: ctxB.societyId,
      ticketId: "t99",
      category: "electrical",
      ticketType: "complaint",
      unitId: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("connector failure does not throw — error is swallowed", async () => {
    const ctx = await setupSociety("dispatcher-swallow");

    const encryptedCreds = encryptValue(
      JSON.stringify({ url: "https://always-fails.example.com" }),
      ENCRYPTION_KEY,
    );
    await tenantDb.withTenant(ctx.societyId, (db) =>
      createIntegrationConfig(db, {
        societyId: ctx.societyId,
        connectorType: "generic_webhook",
        encryptedCredentials: encryptedCreds,
        enabledEvents: ["ticket.created"],
      }),
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));

    const dispatch = createDispatcher(tenantDb, ENCRYPTION_KEY);

    // Should NOT throw even though fetch fails
    await expect(
      dispatch({
        type: "ticket.created",
        societyId: ctx.societyId,
        ticketId: "t1",
        category: "plumbing",
        ticketType: "complaint",
        unitId: null,
      }),
    ).resolves.toBeUndefined();

    fetchMock.mockRestore();
  });
});

// ── Admin HTTP routes ───────────────────────────────────────────────────────

describe("admin integration config CRUD", () => {
  it("creates, lists, and updates a connector config", async () => {
    const ctx = await setupSociety("crud-integration");
    const app = buildApp({
      tenantDb,
      jwtSecret: JWT_SECRET,
      smsProvider: undefined,
      integrationEncryptionKey: ENCRYPTION_KEY,
    });

    // Create
    const createRes = await app.inject({
      method: "POST",
      url: "/admin/integrations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        connectorType: "generic_webhook",
        credentials: { url: "https://hook.example.com", secret: "my-secret" },
        fieldMappings: { ticketId: "TicketNumber" },
        enabledEvents: ["ticket.created"],
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json<{ id: string; hasCredentials: boolean; connectorType: string }>();
    expect(created.connectorType).toBe("generic_webhook");
    expect(created.hasCredentials).toBe(true);

    // List
    const listRes = await app.inject({
      method: "GET",
      url: "/admin/integrations",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json<unknown[]>();
    expect(list.length).toBeGreaterThanOrEqual(1);

    // Update (disable)
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/admin/integrations/${created.id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json<{ isActive: boolean }>().isActive).toBe(false);
  });

  it("credentials are stored encrypted and not exposed in API response", async () => {
    const ctx = await setupSociety("creds-encrypted");
    const app = buildApp({
      tenantDb,
      jwtSecret: JWT_SECRET,
      smsProvider: undefined,
      integrationEncryptionKey: ENCRYPTION_KEY,
    });

    const createRes = await app.inject({
      method: "POST",
      url: "/admin/integrations",
      headers: { authorization: `Bearer ${ctx.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        connectorType: "generic_webhook",
        credentials: { url: "https://sensitive.example.com", secret: "topsecret" },
        enabledEvents: ["payment.captured"],
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const body = createRes.json<Record<string, unknown>>();

    // API response must never expose plaintext credentials
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("topsecret");
    expect(raw).not.toContain("sensitive.example.com");
    expect(body["hasCredentials"]).toBe(true);
  });
});
