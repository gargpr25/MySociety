import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { runMigrations } from "./migrate.js";
import { createParkingSpot, listParkingSpotsByUnitId } from "./repositories/parking-spots.js";
import { findRoleByName } from "./repositories/roles.js";
import { createResident } from "./repositories/residents.js";
import { createSociety } from "./repositories/societies.js";
import { createTower } from "./repositories/towers.js";
import { createUnit } from "./repositories/units.js";
import { createUnitResident, listUnitResidentsByUnitId } from "./repositories/unit-residents.js";
import { withTenantContext } from "./tenant-context.js";

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mysociety_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

let adminPool: Pool;
let appPool: Pool;
let appDb: Database;
const createdSocietyIds: string[] = [];

function uniqueMobile(): string {
  return `9${Math.floor(100_000_000 + Math.random() * 800_000_000)}`;
}

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl });
  await runMigrations(adminPool);
  appPool = new Pool({ connectionString: appUrl });
  appDb = createDb(appPool);
});

afterAll(async () => {
  if (createdSocietyIds.length > 0) {
    await adminPool.query("DELETE FROM societies WHERE id = ANY($1)", [createdSocietyIds]);
  }
  await adminPool.end();
  await appPool.end();
});

async function setupSocietyWithUnitAndResident(name: string) {
  const adminDb = createDb(adminPool);
  const society = await createSociety(adminDb, { name: `${name} ${Date.now()}-${Math.random()}` });
  if (!society) throw new Error("failed to create test society");
  createdSocietyIds.push(society.id);

  const ownerRole = await findRoleByName(adminDb, "resident_owner");
  if (!ownerRole) throw new Error("resident_owner role not seeded");

  return withTenantContext(appDb, society.id, async (tx) => {
    const tower = await createTower(tx, { societyId: society.id, name: "Tower" });
    if (!tower) throw new Error("failed to create tower");
    const unit = await createUnit(tx, {
      societyId: society.id,
      towerId: tower.id,
      flatNo: "101",
      type: "2bhk",
      carpetArea: 950,
    });
    if (!unit) throw new Error("failed to create unit");
    const resident = await createResident(tx, {
      societyId: society.id,
      unitId: unit.id,
      roleId: ownerRole.id,
      name: "Resident",
      mobile: uniqueMobile(),
    });
    if (!resident) throw new Error("failed to create resident");
    return { society, unit, resident };
  });
}

describe("unit_residents / parking_spots Row-Level Security", () => {
  it("only returns unit_residents and parking_spots belonging to the current tenant", async () => {
    const a = await setupSocietyWithUnitAndResident("Directory RLS Society A");
    const b = await setupSocietyWithUnitAndResident("Directory RLS Society B");

    await withTenantContext(appDb, a.society.id, async (tx) => {
      await createUnitResident(tx, {
        societyId: a.society.id,
        unitId: a.unit.id,
        residentId: a.resident.id,
        relationship: "owner",
        isPrimary: true,
      });
      await createParkingSpot(tx, { societyId: a.society.id, spotNo: "P-A1", unitId: a.unit.id });
    });

    await withTenantContext(appDb, b.society.id, async (tx) => {
      await createUnitResident(tx, {
        societyId: b.society.id,
        unitId: b.unit.id,
        residentId: b.resident.id,
        relationship: "owner",
        isPrimary: true,
      });
      await createParkingSpot(tx, { societyId: b.society.id, spotNo: "P-B1", unitId: b.unit.id });
    });

    await withTenantContext(appDb, a.society.id, async (tx) => {
      const links = await listUnitResidentsByUnitId(tx, a.unit.id);
      expect(links).toHaveLength(1);
      const spots = await listParkingSpotsByUnitId(tx, a.unit.id);
      expect(spots).toHaveLength(1);
      expect(spots[0]?.spotNo).toBe("P-A1");

      const crossTenantLinks = await listUnitResidentsByUnitId(tx, b.unit.id);
      expect(crossTenantLinks).toHaveLength(0);
    });
  });

  it("rejects unit_residents writes whose society_id does not match the current tenant context", async () => {
    const a = await setupSocietyWithUnitAndResident("Directory RLS Write A");
    const b = await setupSocietyWithUnitAndResident("Directory RLS Write B");

    await expect(
      withTenantContext(appDb, a.society.id, async (tx) => {
        await createUnitResident(tx, {
          societyId: b.society.id,
          unitId: a.unit.id,
          residentId: a.resident.id,
          relationship: "owner",
        });
      }),
    ).rejects.toThrow();
  });

  it("rejects parking_spots writes whose society_id does not match the current tenant context", async () => {
    const a = await setupSocietyWithUnitAndResident("Directory RLS Parking A");
    const b = await setupSocietyWithUnitAndResident("Directory RLS Parking B");

    await expect(
      withTenantContext(appDb, a.society.id, async (tx) => {
        await createParkingSpot(tx, { societyId: b.society.id, spotNo: "P-X1" });
      }),
    ).rejects.toThrow();
  });

  it("enforces the unique (unit_id, resident_id) constraint, supporting idempotent re-linking", async () => {
    const a = await setupSocietyWithUnitAndResident("Directory RLS Idempotent A");

    await withTenantContext(appDb, a.society.id, async (tx) => {
      const first = await createUnitResident(tx, {
        societyId: a.society.id,
        unitId: a.unit.id,
        residentId: a.resident.id,
        relationship: "owner",
        isPrimary: true,
      });
      expect(first).toBeDefined();

      // onConflictDoNothing: re-running the same link is a no-op, not an error.
      const second = await createUnitResident(tx, {
        societyId: a.society.id,
        unitId: a.unit.id,
        residentId: a.resident.id,
        relationship: "owner",
        isPrimary: true,
      });
      expect(second).toBeUndefined();

      const links = await listUnitResidentsByUnitId(tx, a.unit.id);
      expect(links).toHaveLength(1);
    });
  });
});
