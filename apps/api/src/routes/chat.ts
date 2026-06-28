import type { FastifyInstance } from "fastify";
import {
  createChatSession,
  createTicket,
  findActiveChatSession,
  listChatMessages,
  listTicketsByResident,
  saveChatMessage,
} from "@mysociety/db";
import { z } from "zod";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import { createClassifier, MENU_MESSAGE } from "../chat/classifier.js";

export interface ChatRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
  classifierType?: string;
}

const RESIDENT_ROLES = ["resident_owner", "resident_tenant", "resident_family"] as const;

const sendMessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

export function registerChatRoutes(app: FastifyInstance, options: ChatRouteOptions) {
  const { tenantDb } = options;
  const classifier = createClassifier(options.classifierType);
  const preHandler = [authenticate(options.jwtSecret), requireRole(...RESIDENT_ROLES)];

  // ── POST /resident/chat/message ─────────────────────────────────────────────

  app.post("/resident/chat/message", { preHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const userText = parsed.data.message;

    const session = await tenantDb.withTenant(societyId, async (db) => {
      let s = await findActiveChatSession(db, principal.id);
      if (!s) s = await createChatSession(db, { societyId, residentId: principal.id });
      return s;
    });

    await tenantDb.withTenant(societyId, (db) =>
      saveChatMessage(db, { societyId, sessionId: session.id, role: "user", body: userText }),
    );

    const result = classifier.classify(userText);
    let botReply: string;
    let ticketId: string | undefined;

    if (result.intent === "complaint" || result.intent === "request") {
      const ticket = await tenantDb.withTenant(societyId, (db) =>
        createTicket(db, {
          societyId,
          raisedBy: principal.id,
          type: result.type ?? result.intent,
          category: result.category ?? "other",
          description: userText,
          channel: "chatbot",
        }),
      );
      ticketId = ticket.id;
      const label = result.intent === "complaint" ? "complaint" : "request";
      botReply =
        `Your ${label} has been logged (ticket #${ticket.id.slice(0, 8)}). ` +
        `A facility manager will attend to it shortly. You can track it under Tickets.`;
    } else if (result.intent === "status_query") {
      const tickets = await tenantDb.withTenant(societyId, (db) =>
        listTicketsByResident(db, principal.id),
      );
      if (tickets.length === 0) {
        botReply = "You have no open tickets. If you have a new issue, please describe it and I will raise it.";
      } else {
        const latest = tickets[0]!;
        botReply =
          `Your latest ticket (${latest.category}, #${latest.id.slice(0, 8)}) is currently: ${latest.status}. ` +
          `You have ${tickets.length} ticket(s) in total. View details under Tickets.`;
      }
    } else {
      botReply = MENU_MESSAGE;
    }

    const botMsg = await tenantDb.withTenant(societyId, (db) =>
      saveChatMessage(db, {
        societyId,
        sessionId: session.id,
        role: "bot",
        body: botReply,
        metadata: ticketId ? { ticketId } : {},
      }),
    );

    return reply.send({ reply: botReply, ticketId, messageId: botMsg.id });
  });

  // ── GET /resident/chat/messages ─────────────────────────────────────────────

  app.get("/resident/chat/messages", { preHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const session = await tenantDb.withTenant(societyId, (db) =>
      findActiveChatSession(db, principal.id),
    );

    if (!session) return reply.send([]);

    const messages = await tenantDb.withTenant(societyId, (db) =>
      listChatMessages(db, session.id),
    );

    return reply.send(messages.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role,
      body: m.body,
      metadata: m.metadata,
      createdAt: m.createdAt,
    })));
  });
}
