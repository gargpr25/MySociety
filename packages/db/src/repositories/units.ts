import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { units } from "../schema.js";

export async function createUnit(
  db: Database,
  input: {
    societyId: string;
    towerId: string;
    flatNo: string;
    type: string;
    carpetArea: number;
  },
) {
  const [row] = await db
    .insert(units)
    .values({
      societyId: input.societyId,
      towerId: input.towerId,
      flatNo: input.flatNo,
      type: input.type,
      carpetArea: input.carpetArea,
    })
    .returning();
  return row;
}

export async function findUnitByFlatNo(db: Database, towerId: string, flatNo: string) {
  const [row] = await db
    .select()
    .from(units)
    .where(and(eq(units.towerId, towerId), eq(units.flatNo, flatNo)));
  return row;
}

export async function findUnitById(db: Database, id: string) {
  const [row] = await db.select().from(units).where(eq(units.id, id));
  return row;
}

export async function listUnits(db: Database) {
  return db.select().from(units);
}

export async function updateUnit(
  db: Database,
  id: string,
  input: Partial<{ flatNo: string; type: string; carpetArea: number }>,
) {
  const [row] = await db.update(units).set(input).where(eq(units.id, id)).returning();
  return row;
}

/**
 * Bulk find-or-create for seed/CSV-import scale: looks up every (towerId,
 * flatNo) pair already present, inserts only the missing ones in one
 * statement, then re-selects to return a complete id map. Replaces N
 * sequential round-trips with a fixed three, which matters once N is in the
 * hundreds.
 */
export async function bulkFindOrCreateUnits(
  db: Database,
  societyId: string,
  towerId: string,
  unitsToCreate: Array<{ flatNo: string; type: string; carpetArea: number }>,
): Promise<Map<string, string>> {
  if (unitsToCreate.length === 0) return new Map();

  await db
    .insert(units)
    .values(
      unitsToCreate.map((u) => ({
        societyId,
        towerId,
        flatNo: u.flatNo,
        type: u.type,
        carpetArea: u.carpetArea,
      })),
    )
    .onConflictDoNothing();

  const rows = await db.select().from(units).where(eq(units.towerId, towerId));
  return new Map(rows.map((r) => [r.flatNo, r.id]));
}
