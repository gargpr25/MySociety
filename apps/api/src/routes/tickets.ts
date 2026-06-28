import type { FastifyInstance } from "fastify";
import {
  addTicketComment,
  assignTicket,
  createTicket,
  findTicketById,
  listOverdueOpenTickets,
  listTicketEvents,
  listTicketsByResident,
  listTicketsBySociety,
  markTicketsSlaBreached,
  updateTicketStatus,
} from "@mysociety/db";
import {
  addCommentSchema,
  assignTicketSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketStatusSchema,
} from "@mysociety/types";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import type { DispatcherFn } from "../connectors/dispatcher.js";

export interface TicketRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
  dispatcher?: DispatcherFn;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin", "society_accountant", "facility_manager"] as const;
const RESIDENT_ROLES = ["resident_owner", "resident_tenant", "resident_family"] as const;

export function registerTicketRoutes(app: FastifyInstance, options: TicketRouteOptions) {
  const { tenantDb, dispatcher } = options;
  const residentPreHandler = [authenticate(options.jwtSecret), requireRole(...RESIDENT_ROLES)];
  const adminPreHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];

  // ── Resident: create ticket ─────────────────────────────────────────────────

  app.post("/resident/tickets", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const parsed = createTicketSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const ticket = await tenantDb.withTenant(societyId, (db) =>
      createTicket(db, {
        societyId,
        unitId: parsed.data.unitId,
        raisedBy: principal.id,
        type: parsed.data.type,
        category: parsed.data.category,
        description: parsed.data.description,
        priority: parsed.data.priority,
        channel: "app",
      }),
    );

    dispatcher?.({
      type: "ticket.created",
      societyId,
      ticketId: ticket.id,
      category: ticket.category,
      ticketType: ticket.type,
      unitId: ticket.unitId ?? null,
    }).catch(() => undefined);

    return reply.code(201).send(serializeTicket(ticket));
  });

  // ── Resident: list my tickets ───────────────────────────────────────────────

  app.get("/resident/tickets", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const list = await tenantDb.withTenant(societyId, (db) =>
      listTicketsByResident(db, principal.id),
    );
    return reply.send(list.map(serializeTicket));
  });

  // ── Resident: get ticket detail ─────────────────────────────────────────────

  app.get("/resident/tickets/:id", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const { id } = request.params as { id: string };
    const ticket = await tenantDb.withTenant(societyId, (db) => findTicketById(db, id));
    if (!ticket) return reply.code(404).send({ error: "Not found" });
    if (ticket.raisedBy !== principal.id) return reply.code(403).send({ error: "Forbidden" });

    const events = await tenantDb.withTenant(societyId, (db) => listTicketEvents(db, id));
    return reply.send({ ...serializeTicket(ticket), events: events.map(serializeEvent) });
  });

  // ── Resident: comment on own ticket ────────────────────────────────────────

  app.post("/resident/tickets/:id/comment", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = addCommentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const ticket = await tenantDb.withTenant(societyId, (db) => findTicketById(db, id));
    if (!ticket) return reply.code(404).send({ error: "Not found" });
    if (ticket.raisedBy !== principal.id) return reply.code(403).send({ error: "Forbidden" });

    await tenantDb.withTenant(societyId, (db) =>
      addTicketComment(db, id, principal.id, "resident", parsed.data.body),
    );
    return reply.code(201).send({ ok: true });
  });

  // ── Resident: reopen a resolved ticket ─────────────────────────────────────

  app.post("/resident/tickets/:id/reopen", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const { id } = request.params as { id: string };
    const ticket = await tenantDb.withTenant(societyId, (db) => findTicketById(db, id));
    if (!ticket) return reply.code(404).send({ error: "Not found" });
    if (ticket.raisedBy !== principal.id) return reply.code(403).send({ error: "Forbidden" });

    const result = await tenantDb.withTenant(societyId, (db) =>
      updateTicketStatus(db, id, "reopened", principal.id, "resident"),
    );
    if (result.error) {
      return reply.code(400).send({ error: result.error });
    }
    return reply.send(serializeTicket(result.ticket!));
  });

  // ── Admin: list tickets with optional filters ───────────────────────────────

  app.get("/admin/tickets", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = listTicketsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const list = await tenantDb.withTenant(societyId, (db) =>
      listTicketsBySociety(db, parsed.data),
    );
    return reply.send(list.map(serializeTicket));
  });

  // ── Admin: get ticket detail ────────────────────────────────────────────────

  app.get("/admin/tickets/:id", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const ticket = await tenantDb.withTenant(societyId, (db) => findTicketById(db, id));
    if (!ticket) return reply.code(404).send({ error: "Not found" });

    const events = await tenantDb.withTenant(societyId, (db) => listTicketEvents(db, id));
    return reply.send({ ...serializeTicket(ticket), events: events.map(serializeEvent) });
  });

  // ── Admin: assign ticket ────────────────────────────────────────────────────

  app.post("/admin/tickets/:id/assign", { preHandler: adminPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = assignTicketSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const ticket = await tenantDb.withTenant(societyId, (db) => findTicketById(db, id));
    if (!ticket) return reply.code(404).send({ error: "Not found" });

    const updated = await tenantDb.withTenant(societyId, (db) =>
      assignTicket(db, id, parsed.data.assignedTo, principal.id, parsed.data.comment),
    );
    return reply.send(serializeTicket(updated!));
  });

  // ── Admin: update ticket status ─────────────────────────────────────────────

  app.post("/admin/tickets/:id/status", { preHandler: adminPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = updateTicketStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const ticket = await tenantDb.withTenant(societyId, (db) => findTicketById(db, id));
    if (!ticket) return reply.code(404).send({ error: "Not found" });

    const result = await tenantDb.withTenant(societyId, (db) =>
      updateTicketStatus(db, id, parsed.data.status, principal.id, "admin", parsed.data.comment),
    );
    if (result.error) {
      return reply.code(400).send({ error: result.error });
    }
    const updatedTicket = result.ticket!;
    if (parsed.data.status === "resolved") {
      dispatcher?.({
        type: "ticket.resolved",
        societyId,
        ticketId: updatedTicket.id,
        category: updatedTicket.category,
        ticketType: updatedTicket.type,
        unitId: updatedTicket.unitId ?? null,
      }).catch(() => undefined);
    }
    return reply.send(serializeTicket(updatedTicket));
  });

  // ── Admin: comment on ticket ────────────────────────────────────────────────

  app.post("/admin/tickets/:id/comment", { preHandler: adminPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = addCommentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const ticket = await tenantDb.withTenant(societyId, (db) => findTicketById(db, id));
    if (!ticket) return reply.code(404).send({ error: "Not found" });

    await tenantDb.withTenant(societyId, (db) =>
      addTicketComment(db, id, principal.id, "admin", parsed.data.body),
    );
    return reply.code(201).send({ ok: true });
  });

  // ── Admin: check SLA breaches (synchronous, no Redis) ──────────────────────

  app.post("/admin/tickets/check-sla", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const now = new Date();
    const overdue = await tenantDb.withTenant(societyId, (db) => listOverdueOpenTickets(db, now));
    const ids = overdue.map((r) => r.id);
    const count = await tenantDb.withTenant(societyId, (db) => markTicketsSlaBreached(db, ids));

    return reply.send({ checked: overdue.length, breached: count, breachedTickets: overdue.map(serializeTicket) });
  });
}

function serializeTicket(t: {
  id: string;
  societyId: string;
  unitId: string | null;
  raisedBy: string;
  type: string;
  category: string;
  description: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  slaDueAt: Date | null;
  slaBreached: boolean;
  channel: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    societyId: t.societyId,
    unitId: t.unitId,
    raisedBy: t.raisedBy,
    type: t.type,
    category: t.category,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignedTo: t.assignedTo,
    slaDueAt: t.slaDueAt?.toISOString() ?? null,
    slaBreached: t.slaBreached,
    channel: t.channel,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function serializeEvent(e: {
  id: string;
  societyId: string;
  ticketId: string;
  actorId: string | null;
  actorKind: string;
  eventType: string;
  oldValue: string | null;
  newValue: string | null;
  body: string | null;
  createdAt: Date;
}) {
  return {
    id: e.id,
    ticketId: e.ticketId,
    actorId: e.actorId,
    actorKind: e.actorKind,
    eventType: e.eventType,
    oldValue: e.oldValue,
    newValue: e.newValue,
    body: e.body,
    createdAt: e.createdAt.toISOString(),
  };
}
