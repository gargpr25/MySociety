import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { towers } from "../schema.js";

export async function createTower(db: Database, input: { societyId: string; name: string }) {
  const [row] = await db
    .insert(towers)
    .values({ societyId: input.societyId, name: input.name })
    .returning();
  return row;
}

export async function findTowerByName(db: Database, name: string) {
  const [row] = await db.select().from(towers).where(eq(towers.name, name));
  return row;
}

export async function listTowers(db: Database) {
  return db.select().from(towers);
}
