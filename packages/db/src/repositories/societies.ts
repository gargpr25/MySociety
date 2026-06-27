import { eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { societies } from "../schema.js";

export async function createSociety(
  db: Database,
  input: { name: string; address?: Record<string, unknown>; config?: Record<string, unknown> },
) {
  const [row] = await db
    .insert(societies)
    .values({ name: input.name, address: input.address ?? {}, config: input.config ?? {} })
    .returning();
  return row;
}

export async function findSocietyByName(db: Database, name: string) {
  const [row] = await db.select().from(societies).where(eq(societies.name, name));
  return row;
}
