import { sql } from "drizzle-orm";
import type { Database } from "./client.js";

/**
 * Runs `fn` inside a transaction with `app.current_society_id` set via
 * SET LOCAL (through set_config, so the value is bound as a parameter, not
 * interpolated into SQL). RLS policies key off this setting, and it never
 * outlives the transaction. The society id must come from the authenticated
 * session, never from client-supplied input.
 */
export async function withTenantContext<T>(
  db: Database,
  societyId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_society_id', ${societyId}, true)`);
    return fn(tx as unknown as Database);
  });
}
