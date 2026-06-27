import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { createNotice, findNoticeById, listAllNotices, listActiveNotices } from "./repositories/notices.js";
import { createSociety } from "./repositories/societies.js";
import { withTenantContext } from "./tenant-context.js";

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mysociety_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

let adminPool: Pool;
let appPool: Pool;
const createdSocietyIds: string[] = [];

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl });
  await runMigrations(adminPool);
  appPool = new Pool({ connectionString: appUrl });
});

afterAll(async () => {
  if (createdSocietyIds.length > 0) {
    await adminPool.query("DELETE FROM societies WHERE id = ANY($1)", [createdSocietyIds]);
  }
  await adminPool.end();
  await appPool.end();
});

async function makeSociety(suffix: string) {
  const adminDb = createDb(adminPool);
  const s = await createSociety(adminDb, { name: `Notices RLS ${suffix} ${Date.now()}` });
  if (!s) throw new Error("failed to create society");
  createdSocietyIds.push(s.id);
  return s;
}

describe("notices Row-Level Security", () => {
  it("notices are isolated per tenant", async () => {
    const a = await makeSociety("A");
    const b = await makeSociety("B");
    const appDb = createDb(appPool);

    await withTenantContext(appDb, a.id, (tx) =>
      createNotice(tx, { societyId: a.id, title: "A Notice", body: "body" }),
    );
    await withTenantContext(appDb, b.id, (tx) =>
      createNotice(tx, { societyId: b.id, title: "B Notice", body: "body" }),
    );

    await withTenantContext(appDb, a.id, async (tx) => {
      const notices = await listAllNotices(tx);
      const titles = notices.map((n) => n.title);
      expect(titles).toContain("A Notice");
      expect(titles).not.toContain("B Notice");
    });
  });

  it("rejects notice writes whose society_id does not match current tenant", async () => {
    const a = await makeSociety("Write A");
    const b = await makeSociety("Write B");
    const appDb = createDb(appPool);

    await expect(
      withTenantContext(appDb, a.id, (tx) =>
        createNotice(tx, { societyId: b.id, title: "Cross-tenant", body: "body" }),
      ),
    ).rejects.toThrow();
  });

  it("publish_at / expires_at filtering works correctly", async () => {
    const s = await makeSociety("Timing");
    const appDb = createDb(appPool);

    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3_600_000);

    await withTenantContext(appDb, s.id, async (tx) => {
      await createNotice(tx, { societyId: s.id, title: "Active", body: "body", publishAt: past });
      await createNotice(tx, { societyId: s.id, title: "Future", body: "body", publishAt: future });
      await createNotice(tx, { societyId: s.id, title: "Expired", body: "body", publishAt: past, expiresAt: past });

      const active = await listActiveNotices(tx);
      const titles = active.map((n) => n.title);
      expect(titles).toContain("Active");
      expect(titles).not.toContain("Future");
      expect(titles).not.toContain("Expired");
    });
  });
});
