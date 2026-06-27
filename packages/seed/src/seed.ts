import {
  createAdminUser,
  createDb,
  createPool,
  createResident,
  createSociety,
  createTower,
  createUnit,
  findAdminByEmail,
  findResidentByMobile,
  findRoleByName,
  findSocietyByName,
  findTowerByName,
  findUnitByFlatNo,
  withTenantContext,
  type Database,
} from "@mysociety/db";
import { loadEnv } from "@mysociety/config";

export const SEED_SOCIETY_NAME = "Seed Society";
export const SEED_ADMIN_EMAIL = "admin@seed-society.test";

interface ResidentSeed {
  name: string;
  mobile: string;
  roleName: "resident_owner" | "resident_tenant";
  flatNo: string;
}

const RESIDENT_PLAN: ResidentSeed[] = [
  { name: "Asha Sharma", mobile: "9810000001", roleName: "resident_owner", flatNo: "101" },
  { name: "Vikram Mehta", mobile: "9810000002", roleName: "resident_owner", flatNo: "201" },
  { name: "Priya Nair", mobile: "9810000003", roleName: "resident_tenant", flatNo: "203" },
];

interface UnitSeed {
  flatNo: string;
  type: string;
  carpetArea: number;
}

const TOWER_PLAN: Array<{ name: string; units: UnitSeed[] }> = [
  {
    name: "Tower 1",
    units: [101, 102, 103, 104, 105].map((n) => ({
      flatNo: String(n),
      type: n % 2 === 0 ? "2bhk" : "3bhk",
      carpetArea: n % 2 === 0 ? 950 : 1250,
    })),
  },
  {
    name: "Tower 2",
    units: [201, 202, 203, 204, 205].map((n) => ({
      flatNo: String(n),
      type: n % 2 === 0 ? "2bhk" : "3bhk",
      carpetArea: n % 2 === 0 ? 950 : 1250,
    })),
  },
];

async function findOrCreateSociety(db: Database, name: string) {
  const existing = await findSocietyByName(db, name);
  if (existing) return existing;
  const created = await createSociety(db, { name });
  if (!created) throw new Error(`Failed to create society ${name}`);
  return created;
}

async function findOrCreateTower(db: Database, societyId: string, name: string) {
  return withTenantContext(db, societyId, async (tx) => {
    const existing = await findTowerByName(tx, name);
    if (existing) return existing;
    const created = await createTower(tx, { societyId, name });
    if (!created) throw new Error(`Failed to create tower ${name}`);
    return created;
  });
}

async function findOrCreateUnit(db: Database, societyId: string, towerId: string, unit: UnitSeed) {
  return withTenantContext(db, societyId, async (tx) => {
    const existing = await findUnitByFlatNo(tx, towerId, unit.flatNo);
    if (existing) return existing;
    const created = await createUnit(tx, {
      societyId,
      towerId,
      flatNo: unit.flatNo,
      type: unit.type,
      carpetArea: unit.carpetArea,
    });
    if (!created) throw new Error(`Failed to create unit ${unit.flatNo}`);
    return created;
  });
}

async function findOrCreateSeedAdmin(db: Database, societyId: string) {
  return withTenantContext(db, societyId, async (tx) => {
    const existing = await findAdminByEmail(tx, SEED_ADMIN_EMAIL);
    if (existing) return existing;
    const role = await findRoleByName(tx, "society_admin");
    if (!role) throw new Error("Role society_admin not found; auth migration not applied?");
    const created = await createAdminUser(tx, {
      societyId,
      roleId: role.id,
      email: SEED_ADMIN_EMAIL,
      name: "Seed Society Admin",
    });
    if (!created) throw new Error("Failed to create seed admin");
    return created;
  });
}

/**
 * Seeds one society with 2 towers, 10 units, a few residents, and one
 * society_admin. Find-or-create at every step, so re-running never creates
 * duplicates.
 */
export async function seedFoundation(db: Database) {
  const society = await findOrCreateSociety(db, SEED_SOCIETY_NAME);

  const unitsByFlatNo = new Map<string, string>();
  for (const towerPlan of TOWER_PLAN) {
    const tower = await findOrCreateTower(db, society.id, towerPlan.name);
    for (const unit of towerPlan.units) {
      const created = await findOrCreateUnit(db, society.id, tower.id, unit);
      unitsByFlatNo.set(unit.flatNo, created.id);
    }
  }

  for (const resident of RESIDENT_PLAN) {
    await withTenantContext(db, society.id, async (tx) => {
      const existing = await findResidentByMobile(tx, resident.mobile);
      if (existing) return existing;
      const role = await findRoleByName(tx, resident.roleName);
      if (!role) throw new Error(`Role ${resident.roleName} not found; auth migration not applied?`);
      const created = await createResident(tx, {
        societyId: society.id,
        unitId: unitsByFlatNo.get(resident.flatNo) ?? null,
        roleId: role.id,
        name: resident.name,
        mobile: resident.mobile,
      });
      if (!created) throw new Error(`Failed to create resident ${resident.mobile}`);
      return created;
    });
  }

  await findOrCreateSeedAdmin(db, society.id);

  return society;
}

async function main() {
  const env = loadEnv();
  if (!env.SEED_ENABLED) {
    console.log("SEED_ENABLED is false; skipping seed.");
    return;
  }

  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);
  try {
    const society = await seedFoundation(db);
    console.log(`Seed complete for society "${society.name}" (${society.id}).`);
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
