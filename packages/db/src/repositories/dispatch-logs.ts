import { desc, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { dispatchLogs } from "../schema.js";

export async function createDispatchLog(
  db: Database,
  input: {
    societyId: string;
    integrationId: string;
    eventType: string;
    status: "success" | "failed";
    payload?: object;
    responseBody?: string;
    errorMessage?: string;
    attemptCount?: number;
  },
) {
  const [row] = await db
    .insert(dispatchLogs)
    .values({
      societyId: input.societyId,
      integrationId: input.integrationId,
      eventType: input.eventType,
      status: input.status,
      payload: input.payload ?? {},
      responseBody: input.responseBody ?? null,
      errorMessage: input.errorMessage ?? null,
      attemptCount: input.attemptCount ?? 1,
    })
    .returning();
  return row;
}

export async function listDispatchLogsByIntegration(
  db: Database,
  integrationId: string,
  limit = 50,
) {
  return db
    .select()
    .from(dispatchLogs)
    .where(eq(dispatchLogs.integrationId, integrationId))
    .orderBy(desc(dispatchLogs.createdAt))
    .limit(limit);
}

export async function listDispatchLogsBySociety(db: Database, limit = 100) {
  return db
    .select()
    .from(dispatchLogs)
    .orderBy(desc(dispatchLogs.createdAt))
    .limit(limit);
}
