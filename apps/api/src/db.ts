import { createDb, createPool, withTenantContext, type Database } from "@mysociety/db";
import type { Pool } from "pg";

export interface TenantAwareDb {
  pool: Pool;
  db: Database;
  /**
   * Runs `fn` in a transaction scoped to `societyId` via
   * SET LOCAL app.current_society_id, which RLS policies key off. societyId
   * must come from the authenticated session — callers must never pass
   * through client-supplied input here.
   */
  withTenant<T>(societyId: string, fn: (tx: Database) => Promise<T>): Promise<T>;
}

export function createTenantAwareDb(databaseUrl: string): TenantAwareDb {
  const pool = createPool(databaseUrl);
  const db = createDb(pool);
  return {
    pool,
    db,
    withTenant: (societyId, fn) => withTenantContext(db, societyId, fn),
  };
}
