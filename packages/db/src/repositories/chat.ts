import { and, asc, eq } from "drizzle-orm";
import { chatMessages, chatSessions } from "../schema.js";
import type { Database } from "../index.js";

export async function findActiveChatSession(db: Database, residentId: string) {
  const [row] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.residentId, residentId), eq(chatSessions.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function createChatSession(db: Database, input: { societyId: string; residentId: string }) {
  const [row] = await db
    .insert(chatSessions)
    .values({ societyId: input.societyId, residentId: input.residentId })
    .returning();
  return row!;
}

export async function saveChatMessage(
  db: Database,
  input: { societyId: string; sessionId: string; role: "user" | "bot"; body: string; metadata?: Record<string, unknown> },
) {
  const [row] = await db
    .insert(chatMessages)
    .values({
      societyId: input.societyId,
      sessionId: input.sessionId,
      role: input.role,
      body: input.body,
      metadata: input.metadata ?? {},
    })
    .returning();
  return row!;
}

export async function listChatMessages(db: Database, sessionId: string) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));
}
