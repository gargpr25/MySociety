import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { runMigrations } from "./migrate.js";
import { createSociety } from "./repositories/societies.js";
import { createTower, listTowers } from "./repositories/towers.js";
import { createUnit, listUnits } from "./repositories/units.js";
import { withTenantContext } from "./tenant-context.js";

// Admin connection: only used to apply migrations and to clean up test rows.
// Superusers bypass RLS unconditionally, so it must never be used to assert
// tenant isolation.
const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mysociety_test";

// App-role connection: this is the one RLS is actually enforced against.
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

let adminPool: Pool;
let appPool: Pool;
let appDb: Database;
// Tracks only the societies this file creates, so cleanup never touches rows
// owned by other test files running concurrently against the same database.
const createdSocietyIds: string[] = [];

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl });
  await runMigrations(adminPool);
  appPool = new Pool({ connectionString: appUrl });
  appDb = createDb(appPool);
});

afterAll(async () => {
  if (createdSocietyIds.length > 0) {
    // ON DELETE CASCADE on towers/units takes care of their child rows.
    await adminPool.query("DELETE FROM societies WHERE id = ANY($1)", [createdSocietyIds]);
  }
  await adminPool.end();
  await appPool.end();
});

describe("Row-Level Security tenant isolation", () => {
  it("only returns units belonging to the current tenant", async () => {
    const adminDb = createDb(adminPool);
    const societyA = await createSociety(adminDb, { name: `RLS Test Society A ${Date.now()}` });
    const societyB = await createSociety(adminDb, { name: `RLS Test Society B ${Date.now()}` });
    if (!societyA || !societyB) throw new Error("failed to create test societies");
    createdSocietyIds.push(societyA.id, societyB.id);

    await withTenantContext(appDb, societyA.id, async (tx) => {
      const tower = await createTower(tx, { societyId: societyA.id, name: "A Tower" });
      if (!tower) throw new Error("failed to create tower");
      await createUnit(tx, {
        societyId: societyA.id,
        towerId: tower.id,
        flatNo: "A-101",
        type: "2bhk",
        carpetArea: 950,
      });
    });

    await withTenantContext(appDb, societyB.id, async (tx) => {
      const tower = await createTower(tx, { societyId: societyB.id, name: "B Tower" });
      if (!tower) throw new Error("failed to create tower");
      await createUnit(tx, {
        societyId: societyB.id,
        towerId: tower.id,
        flatNo: "B-101",
        type: "3bhk",
        carpetArea: 1200,
      });
    });

    await withTenantContext(appDb, societyA.id, async (tx) => {
      const visibleUnits = await listUnits(tx);
      const visibleTowers = await listTowers(tx);
      expect(visibleUnits).toHaveLength(1);
      expect(visibleUnits[0]?.flatNo).toBe("A-101");
      expect(visibleTowers).toHaveLength(1);
      expect(visibleTowers[0]?.name).toBe("A Tower");
    });

    await withTenantContext(appDb, societyB.id, async (tx) => {
      const visibleUnits = await listUnits(tx);
      expect(visibleUnits).toHaveLength(1);
      expect(visibleUnits[0]?.flatNo).toBe("B-101");
    });
  });

  it("rejects writes whose society_id does not match the current tenant context", async () => {
    const adminDb = createDb(adminPool);
    const societyA = await createSociety(adminDb, { name: `RLS Write Test A ${Date.now()}` });
    const societyB = await createSociety(adminDb, { name: `RLS Write Test B ${Date.now()}` });
    if (!societyA || !societyB) throw new Error("failed to create test societies");
    createdSocietyIds.push(societyA.id, societyB.id);

    await expect(
      withTenantContext(appDb, societyA.id, async (tx) => {
        await createTower(tx, { societyId: societyB.id, name: "Illegal cross-tenant tower" });
      }),
    ).rejects.toThrow();
  });

  it("returns no rows when no tenant context has been set", async () => {
    const adminDb = createDb(adminPool);
    const society = await createSociety(adminDb, { name: `RLS No Context ${Date.now()}` });
    if (!society) throw new Error("failed to create test society");
    createdSocietyIds.push(society.id);
    await withTenantContext(appDb, society.id, async (tx) => {
      await createTower(tx, { societyId: society.id, name: "Some Tower" });
    });

    // No SET LOCAL app.current_society_id in this transaction at all.
    await appDb.transaction(async (tx) => {
      const visible = await listTowers(tx as unknown as Database);
      expect(visible).toHaveLength(0);
    });
  });
});
