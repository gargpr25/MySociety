import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { roles } from "../schema.js";

export async function findRoleByName(db: Database, name: string) {
  const [row] = await db.select().from(roles).where(eq(roles.name, name));
  return row;
}

export async function findRoleById(db: Database, id: string) {
  const [row] = await db.select().from(roles).where(eq(roles.id, id));
  return row;
}
