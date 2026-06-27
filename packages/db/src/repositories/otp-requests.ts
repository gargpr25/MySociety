import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { otpRequests } from "../schema.js";

export async function countRecentOtpRequests(
  db: Database,
  purpose: string,
  identifier: string,
  since: Date,
) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(otpRequests)
    .where(
      and(
        eq(otpRequests.purpose, purpose),
        eq(otpRequests.identifier, identifier),
        gte(otpRequests.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function createOtpRequest(
  db: Database,
  input: { purpose: string; identifier: string; codeHash: string; expiresAt: Date },
) {
  const [row] = await db
    .insert(otpRequests)
    .values({
      purpose: input.purpose,
      identifier: input.identifier,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
    })
    .returning();
  return row;
}

export async function findLatestOtpRequest(db: Database, purpose: string, identifier: string) {
  const [row] = await db
    .select()
    .from(otpRequests)
    .where(
      and(
        eq(otpRequests.purpose, purpose),
        eq(otpRequests.identifier, identifier),
        isNull(otpRequests.consumedAt),
      ),
    )
    .orderBy(sql`${otpRequests.createdAt} DESC`)
    .limit(1);
  return row;
}

export async function incrementOtpAttempts(db: Database, id: string) {
  const [row] = await db
    .update(otpRequests)
    .set({ attempts: sql`${otpRequests.attempts} + 1` })
    .where(eq(otpRequests.id, id))
    .returning();
  return row;
}

export async function markOtpConsumed(db: Database, id: string) {
  const [row] = await db
    .update(otpRequests)
    .set({ consumedAt: new Date() })
    .where(eq(otpRequests.id, id))
    .returning();
  return row;
}
