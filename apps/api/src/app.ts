import Fastify, { type FastifyInstance } from "fastify";
import type { TenantAwareDb } from "./db.js";

export interface BuildAppOptions {
  tenantDb?: TenantAwareDb;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });

  if (options.tenantDb) {
    app.decorate("tenantDb", options.tenantDb);
  }

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    tenantDb?: TenantAwareDb;
  }
}
