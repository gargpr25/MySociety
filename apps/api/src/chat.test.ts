import {
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
import { RuleBasedClassifier, MENU_MESSAGE } from "./chat/classifier.js";

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
  residentId: string;
  residentToken: string;
}

async function setupSociety(label: string): Promise<TestCtx> {
  const adminDb = createDb(adminPool);
  const society = await createSociety(adminDb, { name: `chat-${label}-${Date.now()}-${Math.random()}` });
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
    name: "Chat Resident",
    mobile: `+91${String(Date.now()).slice(-10)}`,
  });
  if (!resident) throw new Error("resident creation failed");

  const residentToken = signAccessToken(JWT_SECRET, {
    id: resident.id,
    kind: "resident",
    societyId: society.id,
    role: "resident_owner",
    name: resident.name,
    identifier: resident.mobile,
  });

  return { societyId: society.id, residentId: resident.id, residentToken };
}

// ── Classifier unit tests ────────────────────────────────────────────────────

describe("RuleBasedClassifier", () => {
  const clf = new RuleBasedClassifier();

  it("classifies electrical complaint", () => {
    const r = clf.classify("my light is not working in the kitchen");
    expect(r.intent).toBe("complaint");
    expect(r.category).toBe("electric");
  });

  it("classifies plumbing complaint", () => {
    const r = clf.classify("there is a water leak under the sink");
    expect(r.intent).toBe("complaint");
    expect(r.category).toBe("plumbing");
  });

  it("classifies AC cleaning request", () => {
    const r = clf.classify("please clean my ac filter");
    expect(r.intent).toBe("request");
    expect(r.category).toBe("ac_cleaning");
  });

  it("classifies status query", () => {
    const r = clf.classify("where is my complaint status");
    expect(r.intent).toBe("status_query");
  });

  it("returns unknown for unrecognised text", () => {
    const r = clf.classify("hello how are you doing today");
    expect(r.intent).toBe("unknown");
  });
});

// ── Chat API integration tests ────────────────────────────────────────────────

describe("Chat — message routing and ticket creation", () => {
  it("electrical complaint creates a ticket and returns confirmation", async () => {
    const ctx = await setupSociety("electric");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const res = await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "the light in my bedroom is not working" }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ reply: string; ticketId?: string; messageId: string }>();
    expect(body.ticketId).toBeTruthy();
    expect(body.reply).toMatch(/complaint has been logged/i);
    expect(body.messageId).toBeTruthy();
  });

  it("unknown input returns the menu", async () => {
    const ctx = await setupSociety("menu");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const res = await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "hello good morning" }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ reply: string }>();
    expect(body.reply).toBe(MENU_MESSAGE);
    expect((body as { ticketId?: string }).ticketId).toBeUndefined();
  });

  it("status query reads DB and returns ticket status", async () => {
    const ctx = await setupSociety("status");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    // First create a ticket via chat
    await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "there is a leak in my bathroom pipe" }),
    });

    // Now ask for status
    const res = await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "what is the status of my complaint" }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ reply: string }>();
    expect(body.reply).toMatch(/open|in_progress|resolved|assigned/i);
    expect(body.reply).toMatch(/ticket/i);
  });

  it("bot never auto-resolves a ticket", async () => {
    const ctx = await setupSociety("noresolve");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    const res = await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "my fan is making noise, please fix it" }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ reply: string; ticketId?: string }>();
    expect(body.ticketId).toBeTruthy();

    // Status query should show the ticket is still open (never resolved by bot)
    const statusRes = await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "status" }),
    });
    const statusBody = statusRes.json<{ reply: string }>();
    expect(statusBody.reply).toMatch(/open/i);
  });

  it("GET /resident/chat/messages returns conversation history", async () => {
    const ctx = await setupSociety("history");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctx.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "my tap is leaking" }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/resident/chat/messages",
      headers: { authorization: `Bearer ${ctx.residentToken}` },
    });

    expect(res.statusCode).toBe(200);
    const messages = res.json<Array<{ role: string; body: string }>>();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages.some((m) => m.role === "user")).toBe(true);
    expect(messages.some((m) => m.role === "bot")).toBe(true);
  });

  it("RLS: resident from society A cannot see society B messages", async () => {
    const ctxA = await setupSociety("rls-a");
    const ctxB = await setupSociety("rls-b");
    const app = buildApp({ tenantDb, jwtSecret: JWT_SECRET });

    // Society A resident sends a message
    await app.inject({
      method: "POST",
      url: "/resident/chat/message",
      headers: { authorization: `Bearer ${ctxA.residentToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "electrical fault in flat A" }),
    });

    // Society B resident queries messages — should see empty (no session yet)
    const res = await app.inject({
      method: "GET",
      url: "/resident/chat/messages",
      headers: { authorization: `Bearer ${ctxB.residentToken}` },
    });

    expect(res.statusCode).toBe(200);
    const messages = res.json<Array<{ body: string }>>();
    const hasSocAMessage = messages.some((m) => m.body.includes("electrical fault in flat A"));
    expect(hasSocAMessage).toBe(false);
  });
});
