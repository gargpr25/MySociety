import { and, eq, inArray, lt, notInArray } from "drizzle-orm";
import { tickets, ticketEvents } from "../schema.js";
import type { Database } from "../index.js";

const SLA_HOURS: Record<string, number> = {
  electric: 4,
  plumbing: 4,
  mason: 48,
  painting: 72,
  ac_cleaning: 24,
  shifting: 24,
  parking_alloc: 72,
  playground_alloc: 24,
  other: 48,
};

function computeSlaDueAt(category: string): Date {
  const hours = SLA_HOURS[category] ?? 48;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export interface CreateTicketInput {
  societyId: string;
  unitId?: string;
  raisedBy: string;
  type: string;
  category: string;
  description: string;
  priority?: string;
  channel?: string;
}

export async function createTicket(db: Database, input: CreateTicketInput) {
  const slaDueAt = computeSlaDueAt(input.category);
  const [ticket] = await db
    .insert(tickets)
    .values({
      societyId: input.societyId,
      unitId: input.unitId ?? null,
      raisedBy: input.raisedBy,
      type: input.type,
      category: input.category,
      description: input.description,
      priority: input.priority ?? "normal",
      channel: input.channel ?? "app",
      slaDueAt,
    })
    .returning();

  await db.insert(ticketEvents).values({
    societyId: input.societyId,
    ticketId: ticket!.id,
    actorId: input.raisedBy,
    actorKind: "resident",
    eventType: "created",
    newValue: "open",
  });

  return ticket!;
}

export async function findTicketById(db: Database, id: string) {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return row ?? null;
}

export interface ListTicketsFilter {
  status?: string;
  assignedTo?: string;
  category?: string;
  type?: string;
}

export async function listTicketsBySociety(db: Database, filter: ListTicketsFilter = {}) {
  const conditions = [];
  if (filter.status) conditions.push(eq(tickets.status, filter.status));
  if (filter.assignedTo) conditions.push(eq(tickets.assignedTo, filter.assignedTo));
  if (filter.category) conditions.push(eq(tickets.category, filter.category));
  if (filter.type) conditions.push(eq(tickets.type, filter.type));

  return db
    .select()
    .from(tickets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(tickets.createdAt);
}

export async function listTicketsByResident(db: Database, residentId: string) {
  return db
    .select()
    .from(tickets)
    .where(eq(tickets.raisedBy, residentId))
    .orderBy(tickets.createdAt);
}

export async function assignTicket(
  db: Database,
  id: string,
  assignedTo: string,
  actorId: string,
  comment?: string,
) {
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) return null;

  const [updated] = await db
    .update(tickets)
    .set({ assignedTo, status: "assigned", updatedAt: new Date() })
    .where(eq(tickets.id, id))
    .returning();

  await db.insert(ticketEvents).values({
    societyId: existing.societyId,
    ticketId: id,
    actorId,
    actorKind: "admin",
    eventType: "assigned",
    oldValue: existing.assignedTo ?? undefined,
    newValue: assignedTo,
    body: comment ?? null,
  });

  return updated!;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "resolved", "closed"],
  assigned: ["in_progress", "resolved", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["assigned", "in_progress", "resolved", "closed"],
};

export async function updateTicketStatus(
  db: Database,
  id: string,
  newStatus: string,
  actorId: string | undefined,
  actorKind: "resident" | "admin" | "system",
  comment?: string,
): Promise<{ ticket: typeof tickets.$inferSelect; error?: never } | { ticket?: never; error: string }> {
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) return { error: "not_found" };

  const allowed = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { error: `invalid_transition:${existing.status}->${newStatus}` };
  }

  const [updated] = await db
    .update(tickets)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(tickets.id, id))
    .returning();

  await db.insert(ticketEvents).values({
    societyId: existing.societyId,
    ticketId: id,
    actorId: actorId ?? null,
    actorKind,
    eventType: "status_change",
    oldValue: existing.status,
    newValue: newStatus,
    body: comment ?? null,
  });

  return { ticket: updated! };
}

export async function addTicketComment(
  db: Database,
  id: string,
  actorId: string,
  actorKind: "resident" | "admin",
  body: string,
) {
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) return null;

  await db.insert(ticketEvents).values({
    societyId: existing.societyId,
    ticketId: id,
    actorId,
    actorKind,
    eventType: "comment",
    body,
  });

  return true;
}

export async function listTicketEvents(db: Database, ticketId: string) {
  return db
    .select()
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(ticketEvents.createdAt);
}

export async function listOverdueOpenTickets(db: Database, now: Date) {
  return db
    .select()
    .from(tickets)
    .where(
      and(
        lt(tickets.slaDueAt, now),
        eq(tickets.slaBreached, false),
        notInArray(tickets.status, ["resolved", "closed"]),
      ),
    );
}

export async function markTicketsSlaBreached(db: Database, ids: string[]) {
  if (ids.length === 0) return 0;
  const result = await db
    .update(tickets)
    .set({ slaBreached: true, updatedAt: new Date() })
    .where(inArray(tickets.id, ids));
  return result.rowCount ?? 0;
}
