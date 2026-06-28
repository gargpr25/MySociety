import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import type { SmsProvider } from "@mysociety/config";
import type { TenantAwareDb } from "./db.js";
import { registerAdminBillingRoutes } from "./routes/admin-billing.js";
import { registerAdminDirectoryRoutes } from "./routes/admin-directory.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerNoticeRoutes } from "./routes/notices.js";
import { registerResidentBillingRoutes } from "./routes/resident-billing.js";

export interface BuildAppOptions {
  tenantDb?: TenantAwareDb;
  jwtSecret?: string;
  smsProvider?: SmsProvider;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  app.register(multipart);

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

  if (options.tenantDb && options.jwtSecret) {
    registerAdminDirectoryRoutes(app, {
      tenantDb: options.tenantDb,
      jwtSecret: options.jwtSecret,
    });
    registerNoticeRoutes(app, {
      tenantDb: options.tenantDb,
      jwtSecret: options.jwtSecret,
    });
    registerAdminBillingRoutes(app, {
      tenantDb: options.tenantDb,
      jwtSecret: options.jwtSecret,
    });
    registerResidentBillingRoutes(app, {
      tenantDb: options.tenantDb,
      jwtSecret: options.jwtSecret,
    });
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    tenantDb?: TenantAwareDb;
  }
}
