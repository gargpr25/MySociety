import {
  createDb,
  createPool,
  createSociety,
  createTower,
  createUnit,
  findSocietyByName,
  findTowerByName,
  findUnitByFlatNo,
  withTenantContext,
  type Database,
} from "@mysociety/db";
import { loadEnv } from "@mysociety/config";

export const SEED_SOCIETY_NAME = "Seed Society";

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

/**
 * Seeds one society with 2 towers and 10 units. Find-or-create at every
 * step, so re-running never creates duplicates.
 */
export async function seedFoundation(db: Database) {
  const society = await findOrCreateSociety(db, SEED_SOCIETY_NAME);

  for (const towerPlan of TOWER_PLAN) {
    const tower = await findOrCreateTower(db, society.id, towerPlan.name);
    for (const unit of towerPlan.units) {
      await findOrCreateUnit(db, society.id, tower.id, unit);
    }
  }

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
