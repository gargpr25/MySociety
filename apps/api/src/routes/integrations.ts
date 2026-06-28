import type { FastifyInstance } from "fastify";
import {
  createIntegrationConfig,
  findIntegrationConfigById,
  listDispatchLogsByIntegration,
  listIntegrationConfigs,
  updateIntegrationConfig,
} from "@mysociety/db";
import { createIntegrationConfigSchema, updateIntegrationConfigSchema } from "@mysociety/types";
import { encryptValue } from "@mysociety/config";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";

export interface IntegrationRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
  encryptionKey: string;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin"] as const;

function serializeConfig(config: {
  id: string;
  societyId: string;
  connectorType: string;
  encryptedCredentials: string;
  fieldMappings: unknown;
  enabledEvents: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: config.id,
    societyId: config.societyId,
    connectorType: config.connectorType,
    hasCredentials: config.encryptedCredentials.length > 0,
    fieldMappings: config.fieldMappings,
    enabledEvents: config.enabledEvents,
    isActive: config.isActive,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function registerIntegrationRoutes(app: FastifyInstance, options: IntegrationRouteOptions) {
  const { tenantDb, encryptionKey } = options;
  const preHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];

  app.get("/admin/integrations", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const configs = await tenantDb.withTenant(societyId, (db) => listIntegrationConfigs(db));
    return reply.send(configs.map(serializeConfig));
  });

  app.post("/admin/integrations", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const parsed = createIntegrationConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const { credentials, ...rest } = parsed.data;
    const encryptedCredentials = encryptValue(JSON.stringify(credentials), encryptionKey);

    const config = await tenantDb.withTenant(societyId, (db) =>
      createIntegrationConfig(db, {
        societyId,
        connectorType: rest.connectorType,
        encryptedCredentials,
        fieldMappings: rest.fieldMappings,
        enabledEvents: rest.enabledEvents,
        isActive: rest.isActive,
      }),
    );

    return reply.code(201).send(serializeConfig(config));
  });

  app.patch("/admin/integrations/:id", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = updateIntegrationConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const existing = await tenantDb.withTenant(societyId, (db) => findIntegrationConfigById(db, id));
    if (!existing) return reply.code(404).send({ error: "Integration config not found" });

    const updates: Parameters<typeof updateIntegrationConfig>[2] = {};
    if (parsed.data.credentials !== undefined) {
      updates.encryptedCredentials = encryptValue(JSON.stringify(parsed.data.credentials), encryptionKey);
    }
    if (parsed.data.fieldMappings !== undefined) updates.fieldMappings = parsed.data.fieldMappings;
    if (parsed.data.enabledEvents !== undefined) updates.enabledEvents = parsed.data.enabledEvents;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    const updated = await tenantDb.withTenant(societyId, (db) =>
      updateIntegrationConfig(db, id, updates),
    );
    if (!updated) return reply.code(404).send({ error: "Not found" });

    return reply.send(serializeConfig(updated));
  });

  app.get("/admin/connectors/:id/logs", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin account is not scoped to a society" });

    const { id } = request.params as { id: string };
    const existing = await tenantDb.withTenant(societyId, (db) => findIntegrationConfigById(db, id));
    if (!existing) return reply.code(404).send({ error: "Integration config not found" });

    const logs = await tenantDb.withTenant(societyId, (db) => listDispatchLogsByIntegration(db, id));
    return reply.send(logs.map((l) => ({
      id: l.id,
      integrationId: l.integrationId,
      eventType: l.eventType,
      status: l.status,
      attemptCount: l.attemptCount,
      responseBody: l.responseBody,
      errorMessage: l.errorMessage,
      createdAt: l.createdAt.toISOString(),
    })));
  });
}
