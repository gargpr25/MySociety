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

export async function listUnits(db: Database) {
  return db.select().from(units);
}
