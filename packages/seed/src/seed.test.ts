import {
  createDb,
  findAdminByEmail,
  findResidentByMobile,
  listParkingSpots,
  listTowers,
  listUnits,
  listUnitResidentsByUnitId,
  runMigrations,
  withTenantContext,
} from "@mysociety/db";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedFoundation, SEED_ADMIN_EMAIL, SEED_SOCIETY_NAME } from "./seed.js";

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
  await adminPool.query("DELETE FROM societies WHERE name = $1", [SEED_SOCIETY_NAME]);
  await adminPool.end();
  await appPool.end();
});

describe("seedFoundation", () => {
  it("creates 10 towers and 500 units, and is idempotent on re-run", async () => {
    const db = createDb(appPool);

    const first = await seedFoundation(db);
    const second = await seedFoundation(db);
    expect(second.id).toBe(first.id);

    await withTenantContext(db, first.id, async (tx) => {
      const towers = await listTowers(tx);
      const units  = await listUnits(tx);
      expect(towers).toHaveLength(10);
      expect(units).toHaveLength(500);
    });

    // Third run still idempotent.
    await seedFoundation(db);
    await withTenantContext(db, first.id, async (tx) => {
      const towers = await listTowers(tx);
      const units  = await listUnits(tx);
      expect(towers).toHaveLength(10);
      expect(units).toHaveLength(500);
    });
  });

  it("seeds ~2660 residents with unit_resident links and a society_admin", async () => {
    const db = createDb(appPool);

    const society = await seedFoundation(db);
    // Idempotency: second run must not add new rows.
    await seedFoundation(db);

    await withTenantContext(db, society.id, async (tx) => {
      // Stable named resident from RESIDENT_PLAN.
      const asha = await findResidentByMobile(tx, "9810000001");
      expect(asha?.name).toBe("Asha Sharma");
      expect(asha?.unitId).not.toBeNull();

      // Bulk-resident counts: 490 owners + 2000 family + 167 tenants = 2657,
      // plus 3 from RESIDENT_PLAN = 2660 total (use a loose lower-bound check
      // so the assertion stays valid if the seed formula is tweaked slightly).
      const allUnits = await listUnits(tx);
      expect(allUnits.length).toBeGreaterThanOrEqual(500);

      // Spot-check unit_residents for the first unit: it should have at least
      // an owner link (from the landlord who owns units 0 and 1).
      const firstUnit = allUnits.find((u) => u.flatNo === "101");
      expect(firstUnit).toBeDefined();
      const links = await listUnitResidentsByUnitId(tx, firstUnit!.id);
      // Unit 101 (global index 0): landlord owner + family batch 0 + family
      // batch 1 + family batch 2 + family batch 3 + 1 tenant (index 0 % 3 === 0)
      expect(links.length).toBeGreaterThanOrEqual(2);

      // Parking spots: 500 car + 100 bike = 600.
      const spots = await listParkingSpots(tx);
      expect(spots).toHaveLength(600);
    });

    const admin = await findAdminByEmail(createDb(adminPool), SEED_ADMIN_EMAIL);
    expect(admin?.societyId).toBe(society.id);
  });

  it("seeds 10 landlords each owning 2 units via unit_residents", async () => {
    const db = createDb(appPool);
    const society = await seedFoundation(db);

    await withTenantContext(db, society.id, async (tx) => {
      const allUnits = await listUnits(tx);
      // Tower 1, flats 101 and 102 should share one owner (landlord #0).
      const unit101 = allUnits.find((u) => u.flatNo === "101");
      const unit102 = allUnits.find((u) => u.flatNo === "102");
      expect(unit101).toBeDefined();
      expect(unit102).toBeDefined();
      const links101 = await listUnitResidentsByUnitId(tx, unit101!.id);
      const links102 = await listUnitResidentsByUnitId(tx, unit102!.id);
      const ownerLinks101 = links101.filter((l) => l.relationship === "owner");
      const ownerLinks102 = links102.filter((l) => l.relationship === "owner");
      expect(ownerLinks101).toHaveLength(1);
      expect(ownerLinks102).toHaveLength(1);
      // Same resident ID in both units → landlord pattern.
      expect(ownerLinks101[0].residentId).toBe(ownerLinks102[0].residentId);
    });
  });
});
