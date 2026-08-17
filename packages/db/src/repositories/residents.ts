import { eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { residents, unitResidents } from "../schema.js";

export async function createResident(
  db: Database,
  input: {
    societyId: string;
    unitId?: string | null;
    roleId: string;
    name: string;
    mobile: string;
    canPay?: boolean;
    isPrimary?: boolean;
  },
) {
  const [row] = await db
    .insert(residents)
    .values({
      societyId: input.societyId,
      unitId: input.unitId ?? null,
      roleId: input.roleId,
      name: input.name,
      mobile: input.mobile,
      canPay: input.canPay ?? true,
      isPrimary: input.isPrimary ?? true,
    })
    .returning();
  return row;
}

export async function findResidentByMobile(db: Database, mobile: string) {
  const [row] = await db.select().from(residents).where(eq(residents.mobile, mobile));
  return row;
}

export async function findResidentById(db: Database, id: string) {
  const [row] = await db.select().from(residents).where(eq(residents.id, id));
  return row;
}

/**
 * Residents living in a unit. unit_residents is the source of truth for the
 * link (that is what the CSV importer, the admin console and the seed write);
 * the denormalized residents.unit_id column is unioned in so rows predating
 * the join table still resolve.
 */
export async function listResidentsByUnitId(db: Database, unitId: string) {
  const linkedResidentIds = db
    .select({ residentId: unitResidents.residentId })
    .from(unitResidents)
    .where(eq(unitResidents.unitId, unitId));

  return db
    .select()
    .from(residents)
    .where(or(inArray(residents.id, linkedResidentIds), eq(residents.unitId, unitId)));
}

/**
 * Every unit a resident is attached to — the inverse of listResidentsByUnitId,
 * and the authorization source for "may this resident act on this unit?".
 * A landlord or a family member can legitimately hold several units.
 */
export async function listUnitIdsForResident(db: Database, residentId: string): Promise<string[]> {
  const [resident] = await db
    .select({ unitId: residents.unitId })
    .from(residents)
    .where(eq(residents.id, residentId));

  const links = await db
    .select({ unitId: unitResidents.unitId })
    .from(unitResidents)
    .where(eq(unitResidents.residentId, residentId));

  const unitIds = new Set(links.map((l) => l.unitId));
  if (resident?.unitId) unitIds.add(resident.unitId);
  return [...unitIds];
}

/**
 * Bulk find-or-create for seed/CSV-import scale, mirroring
 * bulkFindOrCreateUnits: one bulk select of existing mobiles in this society,
 * one chunked insert of only the missing rows, one final select to build a
 * complete mobile -> id map. A landlord (same mobile reused across many
 * units) lands on the same residents row here; the caller links it to
 * multiple units via unit_residents.
 */
export async function bulkFindOrCreateResidents(
  db: Database,
  societyId: string,
  residentsToCreate: Array<{ name: string; mobile: string; roleId: string }>,
): Promise<Map<string, string>> {
  if (residentsToCreate.length === 0) return new Map();

  await db
    .insert(residents)
    .values(
      residentsToCreate.map((r) => ({
        societyId,
        roleId: r.roleId,
        name: r.name,
        mobile: r.mobile,
        unitId: null,
      })),
    )
    .onConflictDoNothing();

  const rows = await db.select().from(residents).where(eq(residents.societyId, societyId));
  return new Map(rows.map((r) => [r.mobile, r.id]));
}

/**
 * Pre-auth lookup: resolves which society (if any) a mobile number belongs
 * to, before any tenant context exists. Goes through the SECURITY DEFINER
 * find_residents_by_mobile() function (see migration 0003), the sole
 * sanctioned cross-tenant read path for residents — RLS still applies to
 * every other read/write against this table.
 */
export async function findResidentsByMobileAcrossTenants(db: Database, mobile: string) {
  // db.execute runs raw SQL outside the schema mapper, so columns come back
  // as Postgres returns them (snake_case); alias each one to match the
  // camelCase shape findResidentByMobile callers already expect.
  const result = await db.execute<typeof residents.$inferSelect>(
    sql`SELECT
      id,
      society_id AS "societyId",
      unit_id AS "unitId",
      role_id AS "roleId",
      name,
      mobile,
      can_pay AS "canPay",
      is_primary AS "isPrimary",
      created_at AS "createdAt"
    FROM find_residents_by_mobile(${mobile})`,
  );
  return result.rows;
}
