import { eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { adminUsers } from "../schema.js";

export async function createAdminUser(
  db: Database,
  input: { societyId?: string | null; roleId: string; email: string; name: string },
) {
  const [row] = await db
    .insert(adminUsers)
    .values({
      societyId: input.societyId ?? null,
      roleId: input.roleId,
      email: input.email,
      name: input.name,
    })
    .returning();
  return row;
}

export async function findAdminByEmail(db: Database, email: string) {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
  return row;
}

export async function findAdminById(db: Database, id: string) {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
  return row;
}

/**
 * Pre-auth lookup, same rationale as findResidentsByMobileAcrossTenants: goes
 * through the SECURITY DEFINER find_admin_by_email() function so an admin's
 * society_id can be resolved before any tenant context exists.
 */
export async function findAdminByEmailAcrossTenants(db: Database, email: string) {
  // See findResidentsByMobileAcrossTenants: raw db.execute results need
  // explicit aliasing back to the camelCase shape the rest of the codebase
  // expects.
  const result = await db.execute<typeof adminUsers.$inferSelect>(
    sql`SELECT
      id,
      society_id AS "societyId",
      role_id AS "roleId",
      email,
      name,
      created_at AS "createdAt"
    FROM find_admin_by_email(${email})`,
  );
  return result.rows;
}
