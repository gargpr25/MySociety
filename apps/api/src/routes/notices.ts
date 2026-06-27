import type { FastifyInstance } from "fastify";
import {
  createNotice,
  deleteNotice,
  findNoticeById,
  listActiveNotices,
  listAllNotices,
  updateNotice,
  type NoticeAudience,
} from "@mysociety/db";
import { createNoticeInputSchema, updateNoticeInputSchema } from "@mysociety/types";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";

export interface NoticeRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin"] as const;
const RESIDENT_ROLES = ["resident_owner", "resident_tenant", "resident_family"] as const;

export function registerNoticeRoutes(app: FastifyInstance, options: NoticeRouteOptions) {
  const adminPreHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];
  const residentPreHandler = [authenticate(options.jwtSecret), requireRole(...RESIDENT_ROLES)];

  // Admin: list all notices
  app.get("/admin/notices", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const rows = await options.tenantDb.withTenant(societyId, (db) => listAllNotices(db));
    return reply.send(rows.map(serializeNotice));
  });

  // Admin: create notice
  app.post("/admin/notices", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = createNoticeInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const { title, body, audience, pinned, publishAt, expiresAt } = parsed.data;
    const notice = await options.tenantDb.withTenant(societyId, (db) =>
      createNotice(db, {
        societyId,
        title,
        body,
        audience: audience as NoticeAudience,
        pinned,
        publishAt: publishAt ? new Date(publishAt) : undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      }),
    );
    return reply.code(201).send(serializeNotice(notice!));
  });

  // Admin: update notice
  app.patch("/admin/notices/:id", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = updateNoticeInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const existing = await options.tenantDb.withTenant(societyId, (db) => findNoticeById(db, id));
    if (!existing) return reply.code(404).send({ error: "Notice not found" });

    const { title, body, audience, pinned, publishAt, expiresAt } = parsed.data;
    const updated = await options.tenantDb.withTenant(societyId, (db) =>
      updateNotice(db, id, {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(audience !== undefined && { audience: audience as NoticeAudience }),
        ...(pinned !== undefined && { pinned }),
        ...(publishAt !== undefined && { publishAt: new Date(publishAt) }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      }),
    );
    return reply.send(serializeNotice(updated!));
  });

  // Admin: delete notice
  app.delete("/admin/notices/:id", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const existing = await options.tenantDb.withTenant(societyId, (db) => findNoticeById(db, id));
    if (!existing) return reply.code(404).send({ error: "Notice not found" });

    await options.tenantDb.withTenant(societyId, (db) => deleteNotice(db, id));
    return reply.code(204).send();
  });

  // Resident: list active notices filtered by their audience
  app.get("/resident/notices", { preHandler: residentPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    const role = request.principal?.role;
    if (!societyId) return reply.code(400).send({ error: "Resident account is not scoped to a society" });

    // Residents always see 'all'; owners also see 'owners'; tenants also see 'tenants'
    const audiences: NoticeAudience[] = ["all"];
    if (role === "resident_owner") audiences.push("owners");
    if (role === "resident_tenant") audiences.push("tenants");
    if (role === "resident_family") {
      // family members see all audience types their primary occupant might see
      audiences.push("owners", "tenants");
    }

    const rows = await options.tenantDb.withTenant(societyId, (db) =>
      listActiveNotices(db, { audiences }),
    );
    return reply.send(rows.map(serializeNotice));
  });

  // Resident: get notice detail
  app.get("/resident/notices/:id", { preHandler: residentPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const notice = await options.tenantDb.withTenant(societyId, (db) => findNoticeById(db, id));
    if (!notice) return reply.code(404).send({ error: "Notice not found" });

    const now = new Date();
    const isActive =
      notice.publishAt <= now && (notice.expiresAt === null || notice.expiresAt > now);
    if (!isActive) return reply.code(404).send({ error: "Notice not found" });

    return reply.send(serializeNotice(notice));
  });
}

function serializeNotice(n: {
  id: string;
  societyId: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  publishAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: n.id,
    societyId: n.societyId,
    title: n.title,
    body: n.body,
    audience: n.audience,
    pinned: n.pinned,
    publishAt: n.publishAt.toISOString(),
    expiresAt: n.expiresAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}
