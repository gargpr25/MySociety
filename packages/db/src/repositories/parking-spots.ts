import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { parkingSpots } from "../schema.js";

export async function createParkingSpot(
  db: Database,
  input: { societyId: string; spotNo: string; type?: string; unitId?: string | null; isRentable?: boolean },
) {
  const [row] = await db
    .insert(parkingSpots)
    .values({
      societyId: input.societyId,
      spotNo: input.spotNo,
      type: input.type ?? "car",
      unitId: input.unitId ?? null,
      isRentable: input.isRentable ?? false,
    })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function findParkingSpotByNo(db: Database, societyId: string, spotNo: string) {
  const [row] = await db
    .select()
    .from(parkingSpots)
    .where(and(eq(parkingSpots.societyId, societyId), eq(parkingSpots.spotNo, spotNo)));
  return row;
}

export async function listParkingSpotsByUnitId(db: Database, unitId: string) {
  return db.select().from(parkingSpots).where(eq(parkingSpots.unitId, unitId));
}

export async function listParkingSpots(db: Database) {
  return db.select().from(parkingSpots);
}

/**
 * Bulk find-or-create for seed scale, same pattern as the other bulk
 * repository helpers.
 */
export async function bulkFindOrCreateParkingSpots(
  db: Database,
  societyId: string,
  spotsToCreate: Array<{ spotNo: string; type?: string; unitId?: string | null; isRentable?: boolean }>,
): Promise<Map<string, string>> {
  if (spotsToCreate.length === 0) return new Map();

  await db
    .insert(parkingSpots)
    .values(
      spotsToCreate.map((s) => ({
        societyId,
        spotNo: s.spotNo,
        type: s.type ?? "car",
        unitId: s.unitId ?? null,
        isRentable: s.isRentable ?? false,
      })),
    )
    .onConflictDoNothing();

  const rows = await db.select().from(parkingSpots).where(eq(parkingSpots.societyId, societyId));
  return new Map(rows.map((r) => [r.spotNo, r.id]));
}
