import Fastify, { type FastifyInstance } from "fastify";
import type { SmsProvider } from "@mysociety/config";
import type { TenantAwareDb } from "./db.js";
import { registerAuthRoutes } from "./routes/auth.js";

export interface BuildAppOptions {
  tenantDb?: TenantAwareDb;
  jwtSecret?: string;
  smsProvider?: SmsProvider;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });

  if (options.tenantDb) {
    app.decorate("tenantDb", options.tenantDb);
  }

  app.get("/health", async () => ({ status: "ok" }));

  if (options.tenantDb && options.jwtSecret && options.smsProvider) {
    registerAuthRoutes(app, {
      tenantDb: options.tenantDb,
      jwtSecret: options.jwtSecret,
      smsProvider: options.smsProvider,
    });
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    tenantDb?: TenantAwareDb;
  }
}
