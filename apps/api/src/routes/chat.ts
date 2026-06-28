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

const CONFIRM_RE = /^(yes|y|ok|confirm|sure|yeah|yep|proceed|raise|create ticket|go ahead)\b/i;
const CANCEL_RE = /^(no|nope|cancel|stop|don'?t|actually|never mind|nevermind)\b/i;

type PendingClassification = {
  intent: "complaint" | "request";
  category: string;
  type: string;
  originalText: string;
};

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

    // Get conversation history before saving user message, to find pending classification
    const history = await tenantDb.withTenant(societyId, (db) => listChatMessages(db, session.id));
    const lastBotMsg = [...history].reverse().find((m) => m.role === "bot");
    const pending = (lastBotMsg?.metadata as Record<string, unknown> | null)?.pendingClassification as PendingClassification | undefined;

    await tenantDb.withTenant(societyId, (db) =>
      saveChatMessage(db, { societyId, sessionId: session.id, role: "user", body: userText }),
    );

    let botReply: string;
    let ticketId: string | undefined;
    let botMetadata: Record<string, unknown> = {};

    if (pending && CONFIRM_RE.test(userText.trim())) {
      // Phase 2 — confirmed: create the ticket
      const ticket = await tenantDb.withTenant(societyId, (db) =>
        createTicket(db, {
          societyId,
          raisedBy: principal.id,
          type: pending.type,
          category: pending.category,
          description: pending.originalText,
          channel: "chatbot",
        }),
      );
      ticketId = ticket.id;
      const label = pending.intent === "complaint" ? "complaint" : "request";
      botReply =
        `Your ${label} has been logged (ticket #${ticket.id.slice(0, 8)}). ` +
        `A facility manager will attend to it shortly. You can track it under Tickets.`;
    } else if (pending && CANCEL_RE.test(userText.trim())) {
      // Phase 2 — cancelled
      botReply = "No problem — I've discarded that. If you have a different issue, please describe it.";
    } else {
      // Phase 1 — classify fresh input (or re-classify if pending was ignored)
      const result = classifier.classify(userText);

      if (result.intent === "complaint" || result.intent === "request") {
        const label = result.intent === "complaint" ? "complaint" : "request";
        const categoryLabel = result.category ?? "general";
        botReply =
          `I've identified this as a **${label}** about **${categoryLabel}**.\n\n` +
          `Shall I raise a ticket? Reply **YES** to confirm or **NO** to cancel.`;
        botMetadata = {
          pendingClassification: {
            intent: result.intent,
            category: result.category ?? "other",
            type: result.type ?? result.intent,
            originalText: userText,
          } satisfies PendingClassification,
        };
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
    }

    const botMsg = await tenantDb.withTenant(societyId, (db) =>
      saveChatMessage(db, {
        societyId,
        sessionId: session.id,
        role: "bot",
        body: botReply,
        metadata: ticketId ? { ticketId } : botMetadata,
      }),
    );

    return reply.send({ reply: botReply, ticketId, messageId: botMsg.id, pendingClassification: botMetadata.pendingClassification ?? null });
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
