import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { unitResidents } from "../schema.js";

export type Relationship = "owner" | "tenant" | "family";

export async function createUnitResident(
  db: Database,
  input: {
    societyId: string;
    unitId: string;
    residentId: string;
    relationship: Relationship;
    isPrimary?: boolean;
    canPay?: boolean;
  },
) {
  const [row] = await db
    .insert(unitResidents)
    .values({
      societyId: input.societyId,
      unitId: input.unitId,
      residentId: input.residentId,
      relationship: input.relationship,
      isPrimary: input.isPrimary ?? false,
      canPay: input.canPay ?? true,
    })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function findUnitResident(db: Database, unitId: string, residentId: string) {
  const [row] = await db
    .select()
    .from(unitResidents)
    .where(and(eq(unitResidents.unitId, unitId), eq(unitResidents.residentId, residentId)));
  return row;
}

export async function listUnitResidentsByUnitId(db: Database, unitId: string) {
  return db.select().from(unitResidents).where(eq(unitResidents.unitId, unitId));
}

export async function updateUnitResident(
  db: Database,
  id: string,
  input: Partial<{ relationship: Relationship; isPrimary: boolean; canPay: boolean }>,
) {
  const [row] = await db.update(unitResidents).set(input).where(eq(unitResidents.id, id)).returning();
  return row;
}

export async function deleteUnitResident(db: Database, id: string) {
  await db.delete(unitResidents).where(eq(unitResidents.id, id));
}

/**
 * Bulk find-or-create for seed/CSV-import scale: same pattern as
 * bulkFindOrCreateUnits/bulkFindOrCreateResidents.
 */
export async function bulkCreateUnitResidents(
  db: Database,
  societyId: string,
  links: Array<{
    unitId: string;
    residentId: string;
    relationship: Relationship;
    isPrimary?: boolean;
    canPay?: boolean;
  }>,
) {
  if (links.length === 0) return;
  await db
    .insert(unitResidents)
    .values(
      links.map((l) => ({
        societyId,
        unitId: l.unitId,
        residentId: l.residentId,
        relationship: l.relationship,
        isPrimary: l.isPrimary ?? false,
        canPay: l.canPay ?? true,
      })),
    )
    .onConflictDoNothing();
}
