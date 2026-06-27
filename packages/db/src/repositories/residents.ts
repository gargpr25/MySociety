import { eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { residents } from "../schema.js";

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
