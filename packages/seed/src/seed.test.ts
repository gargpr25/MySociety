import { createDb, listTowers, listUnits, runMigrations, withTenantContext } from "@mysociety/db";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedFoundation, SEED_SOCIETY_NAME } from "./seed.js";

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mysociety_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

let adminPool: Pool;
let appPool: Pool;

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl });
  await runMigrations(adminPool);
  appPool = new Pool({ connectionString: appUrl });
});

afterAll(async () => {
  // ON DELETE CASCADE on towers/units takes care of their child rows. Only
  // the society this file creates is removed, so it never races with other
  // test files' rows in the same shared database.
  await adminPool.query("DELETE FROM societies WHERE name = $1", [SEED_SOCIETY_NAME]);
  await adminPool.end();
  await appPool.end();
});

describe("seedFoundation", () => {
  it("creates one society with 2 towers and 10 units, and is idempotent on re-run", async () => {
    const db = createDb(appPool);

    const first = await seedFoundation(db);
    const second = await seedFoundation(db);
    expect(second.id).toBe(first.id);

    await withTenantContext(db, first.id, async (tx) => {
      const towers = await listTowers(tx);
      const units = await listUnits(tx);
      expect(towers).toHaveLength(2);
      expect(units).toHaveLength(10);
    });

    // Run a third time to be sure repeated runs never duplicate rows.
    await seedFoundation(db);
    await withTenantContext(db, first.id, async (tx) => {
      const towers = await listTowers(tx);
      const units = await listUnits(tx);
      expect(towers).toHaveLength(2);
      expect(units).toHaveLength(10);
    });
  });
});
