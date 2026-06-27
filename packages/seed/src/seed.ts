import {
  bulkCreateUnitResidents,
  bulkFindOrCreateParkingSpots,
  bulkFindOrCreateResidents,
  bulkFindOrCreateUnits,
  createAdminUser,
  createDb,
  createPool,
  createResident,
  createSociety,
  createTower,
  findAdminByEmail,
  findResidentByMobile,
  findRoleByName,
  findSocietyByName,
  findTowerByName,
  findUnitByFlatNo,
  type Relationship,
  withTenantContext,
  type Database,
} from "@mysociety/db";
import { loadEnv } from "@mysociety/config";

export const SEED_SOCIETY_NAME = "Seed Society";
export const SEED_ADMIN_EMAIL = "admin@seed-society.test";

// Named residents with stable mobiles that tests can reliably look up.
interface ResidentSeed {
  name: string;
  mobile: string;
  roleName: "resident_owner" | "resident_tenant";
  tower: string;
  flatNo: string;
}

const RESIDENT_PLAN: ResidentSeed[] = [
  { name: "Asha Sharma",  mobile: "9810000001", roleName: "resident_owner",  tower: "Tower 1", flatNo: "101" },
  { name: "Vikram Mehta", mobile: "9810000002", roleName: "resident_owner",  tower: "Tower 2", flatNo: "201" },
  { name: "Priya Nair",   mobile: "9810000003", roleName: "resident_tenant", tower: "Tower 2", flatNo: "203" },
];

// ── Deterministic name pools for bulk data ────────────────────────────────────

const FIRST_NAMES = [
  "Aarav", "Aditya", "Amit", "Ananya", "Anjali", "Ankit", "Anushka", "Arjun",
  "Aryan", "Ashish", "Ayush", "Deepak", "Deepika", "Divya", "Gaurav", "Isha",
  "Karan", "Kavya", "Kunal", "Manish", "Meera", "Mohit", "Naman", "Neha",
  "Nikhil", "Nisha", "Pankaj", "Pooja", "Prachi", "Pratik", "Preeti", "Priya",
  "Rahul", "Rajesh", "Rakesh", "Ravi", "Riya", "Rohit", "Sachin", "Sana",
  "Sanjay", "Sanjeev", "Saurabh", "Shikha", "Shreya", "Shweta", "Sonam",
  "Suresh", "Swati", "Tanvi", "Tanya", "Usha", "Varun", "Vikas", "Virat",
  "Vishal", "Yogesh", "Zara", "Deepa",
];

const LAST_NAMES = [
  "Sharma", "Mehta", "Nair", "Patel", "Gupta", "Kumar", "Singh", "Verma",
  "Yadav", "Tiwari", "Joshi", "Mishra", "Pandey", "Dubey", "Rao", "Reddy",
  "Naidu", "Iyer", "Pillai", "Menon", "Jain", "Shah", "Agarwal", "Garg",
  "Bansal", "Goyal", "Mittal", "Khanna", "Kapoor", "Malhotra", "Chopra",
  "Dhawan", "Anand", "Bhatia", "Thakur", "Chauhan", "Rajput", "Bose", "Ghosh",
  "Mukherjee", "Chatterjee", "Chaudhary", "Saxena", "Srivastava", "Awasthi",
  "Tripathi", "Pathak", "Sinha", "Das", "Dey",
];

function seedName(index: number): string {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
 * Mobile-number ranges used by the bulk seed, chosen to never collide with the
 * RESIDENT_PLAN stable mobiles (9810000001–3) or with each other.
 *
 * All numbers: 4-char prefix + String(100000 + index) = 10 digits total.
 *   - Regular owners  : 9820100000 – 9820100479  (480 residents)
 *   - Landlords       : 9820200000 – 9820200009  (10 residents)
 *   - Family batch 0  : 9821100000 – 9821100499  (500 residents)
 *   - Family batch 1  : 9822100000 – 9822100499  (500 residents)
 *   - Family batch 2  : 9825100000 – 9825100499  (500 residents)
 *   - Family batch 3  : 9826100000 – 9826100499  (500 residents)
 *   - Tenants         : 9823100000 – 9823100166  (167 residents)
 */
const FAMILY_PREFIXES = ["9821", "9822", "9825", "9826"] as const;
const LANDLORD_COUNT = 10;

/**
 * Bulk-seeds 10 towers × 50 units, ~2660 residents, unit_resident links, and
 * ~600 parking spots for the given society. Every operation is idempotent via
 * onConflictDoNothing, so repeated runs never produce duplicates.
 */
async function seedDirectory(
  db: Database,
  societyId: string,
  towers: Array<{ id: string; name: string }>,
) {
  // 1. Bulk-create 50 units per tower; build an ordered array of unit IDs.
  const unitIds: string[] = [];
  for (let ti = 0; ti < towers.length; ti++) {
    const towerNum = ti + 1;
    const { id: towerId } = towers[ti]!;
    const unitsSpec = Array.from({ length: 50 }, (_, ui) => ({
      flatNo: String(towerNum * 100 + ui + 1),
      type: ui % 3 === 0 ? "3bhk" : "2bhk",
      carpetArea: ui % 3 === 0 ? 1250 : 950,
    }));
    const flatNoToId = await withTenantContext(db, societyId, (tx) =>
      bulkFindOrCreateUnits(tx, societyId, towerId, unitsSpec),
    );
    for (const spec of unitsSpec) {
      const id = flatNoToId.get(spec.flatNo);
      if (!id) throw new Error(`unit ${spec.flatNo} missing after bulk create`);
      unitIds.push(id);
    }
  }

  // 2. Look up role IDs (one transaction).
  const roleIds = await withTenantContext(db, societyId, async (tx) => {
    const owner  = await findRoleByName(tx, "resident_owner");
    const tenant = await findRoleByName(tx, "resident_tenant");
    const family = await findRoleByName(tx, "resident_family");
    if (!owner || !tenant || !family)
      throw new Error("Roles not seeded; run auth migration first");
    return { owner: owner.id, tenant: tenant.id, family: family.id };
  });

  // 3. Build the full resident list deterministically.
  const residentsToCreate: Array<{ name: string; mobile: string; roleId: string }> = [];

  // 10 landlords — each will be linked to 2 consecutive units (global 0..19).
  for (let k = 0; k < LANDLORD_COUNT; k++) {
    residentsToCreate.push({
      name: seedName(5000 + k),
      mobile: `9820${String(200000 + k)}`,
      roleId: roleIds.owner,
    });
  }

  // Regular owners — one per unit for units 20..499 (480 units).
  for (let i = LANDLORD_COUNT * 2; i < 500; i++) {
    const idx = i - LANDLORD_COUNT * 2;
    residentsToCreate.push({
      name: seedName(idx),
      mobile: `9820${String(100000 + idx)}`,
      roleId: roleIds.owner,
    });
  }

  // 4 family members per unit (all 500 units, 4 distinct mobile prefix ranges).
  for (let batch = 0; batch < FAMILY_PREFIXES.length; batch++) {
    for (let i = 0; i < 500; i++) {
      residentsToCreate.push({
        name: seedName(1000 + batch * 500 + i),
        mobile: `${FAMILY_PREFIXES[batch]}${String(100000 + i)}`,
        roleId: roleIds.family,
      });
    }
  }

  // Tenants — 1 per every 3 units (167 tenants covering units at indices 0, 3, 6, …).
  let tenantSeq = 0;
  for (let i = 0; i < 500; i += 3) {
    residentsToCreate.push({
      name: seedName(4000 + tenantSeq),
      mobile: `9823${String(100000 + tenantSeq)}`,
      roleId: roleIds.tenant,
    });
    tenantSeq++;
  }

  const mobileToId = await withTenantContext(db, societyId, (tx) =>
    bulkFindOrCreateResidents(tx, societyId, residentsToCreate),
  );

  // 4. Build unit_residents links.
  const links: Array<{
    unitId: string;
    residentId: string;
    relationship: Relationship;
    isPrimary: boolean;
  }> = [];

  // Landlords: each owns 2 consecutive units.
  for (let k = 0; k < LANDLORD_COUNT; k++) {
    const residentId = mobileToId.get(`9820${String(200000 + k)}`)!;
    links.push({ unitId: unitIds[k * 2]!,     residentId, relationship: "owner", isPrimary: true });
    links.push({ unitId: unitIds[k * 2 + 1]!, residentId, relationship: "owner", isPrimary: true });
  }

  // Regular owners.
  for (let i = LANDLORD_COUNT * 2; i < 500; i++) {
    const idx = i - LANDLORD_COUNT * 2;
    const residentId = mobileToId.get(`9820${String(100000 + idx)}`)!;
    links.push({ unitId: unitIds[i]!, residentId, relationship: "owner", isPrimary: true });
  }

  // Family members.
  for (let batch = 0; batch < FAMILY_PREFIXES.length; batch++) {
    for (let i = 0; i < 500; i++) {
      const residentId = mobileToId.get(`${FAMILY_PREFIXES[batch]}${String(100000 + i)}`)!;
      links.push({ unitId: unitIds[i]!, residentId, relationship: "family", isPrimary: false });
    }
  }

  // Tenants.
  tenantSeq = 0;
  for (let i = 0; i < 500; i += 3) {
    const residentId = mobileToId.get(`9823${String(100000 + tenantSeq)}`)!;
    links.push({ unitId: unitIds[i]!, residentId, relationship: "tenant", isPrimary: false });
    tenantSeq++;
  }

  await withTenantContext(db, societyId, (tx) =>
    bulkCreateUnitResidents(tx, societyId, links),
  );

  // 5. Parking spots: 1 car per unit + 1 bike per every 5th unit (~600 total).
  const spotsToCreate: Array<{ spotNo: string; type: string; unitId: string }> = [];
  for (let i = 0; i < 500; i++) {
    const towerNum = Math.floor(i / 50) + 1;
    const unitNum  = (i % 50) + 1;
    const baseNo = `T${towerNum}P${String(unitNum).padStart(3, "0")}`;
    spotsToCreate.push({ spotNo: baseNo, type: "car", unitId: unitIds[i]! });
    if (i % 5 === 0) {
      spotsToCreate.push({ spotNo: `${baseNo}B`, type: "bike", unitId: unitIds[i]! });
    }
  }

  await withTenantContext(db, societyId, (tx) =>
    bulkFindOrCreateParkingSpots(tx, societyId, spotsToCreate),
  );
}

/**
 * Seeds one society with 10 towers, 500 units, ~2660 residents (including 10
 * landlords each owning 2 units), unit_resident links, ~600 parking spots, and
 * one society_admin. Idempotent — re-running never creates duplicate rows.
 */
export async function seedFoundation(db: Database) {
  const society = await findOrCreateSociety(db, SEED_SOCIETY_NAME);

  // Create 10 towers sequentially to avoid insert-race on the unique index.
  const towerRecords: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < 10; i++) {
    const tower = await findOrCreateTower(db, society.id, `Tower ${i + 1}`);
    towerRecords.push(tower);
  }

  // Bulk-seed units, residents, links, and parking spots.
  await seedDirectory(db, society.id, towerRecords);

  // Stable named residents with known mobiles for test look-ups.
  for (const resident of RESIDENT_PLAN) {
    const towerRecord = towerRecords.find((t) => t.name === resident.tower);
    if (!towerRecord) throw new Error(`Tower "${resident.tower}" missing from towerRecords`);

    const unit = await withTenantContext(db, society.id, (tx) =>
      findUnitByFlatNo(tx, towerRecord.id, resident.flatNo),
    );

    await withTenantContext(db, society.id, async (tx) => {
      const existing = await findResidentByMobile(tx, resident.mobile);
      if (existing) return existing;
      const role = await findRoleByName(tx, resident.roleName);
      if (!role) throw new Error(`Role ${resident.roleName} not found; auth migration not applied?`);
      const created = await createResident(tx, {
        societyId: society.id,
        unitId: unit?.id ?? null,
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
