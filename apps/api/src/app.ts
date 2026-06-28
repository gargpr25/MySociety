import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import type { PaymentProvider, SmsProvider } from "@mysociety/config";
import type { Database } from "@mysociety/db";
import type { TenantAwareDb } from "./db.js";
import { registerAdminBillingRoutes } from "./routes/admin-billing.js";
import { registerAdminBankRoutes } from "./routes/admin-bank.js";
import { registerAdminDirectoryRoutes } from "./routes/admin-directory.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerNoticeRoutes } from "./routes/notices.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerResidentBillingRoutes } from "./routes/resident-billing.js";
import { registerTicketRoutes } from "./routes/tickets.js";

export interface BuildAppOptions {
  tenantDb?: TenantAwareDb;
  superAdminDb?: Database;
  jwtSecret?: string;
  smsProvider?: SmsProvider;
  paymentProvider?: PaymentProvider;
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
    registerTicketRoutes(app, {
      tenantDb: options.tenantDb,
      jwtSecret: options.jwtSecret,
    });

    if (options.paymentProvider && options.superAdminDb) {
      registerPaymentRoutes(app, {
        tenantDb: options.tenantDb,
        superAdminDb: options.superAdminDb,
        jwtSecret: options.jwtSecret,
        paymentProvider: options.paymentProvider,
      });
      registerAdminBankRoutes(app, {
        tenantDb: options.tenantDb,
        superAdminDb: options.superAdminDb,
        jwtSecret: options.jwtSecret,
        paymentProvider: options.paymentProvider,
      });
    }
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    tenantDb?: TenantAwareDb;
  }
}
