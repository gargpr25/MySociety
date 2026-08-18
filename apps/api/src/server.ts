import { Pool } from "pg";
import { createPaymentProvider, createSmsProvider, loadEnv } from "@mysociety/config";
import { createDb, createPool, runMigrations } from "@mysociety/db";
import { buildApp } from "./app.js";
import { createTenantAwareDb } from "./db.js";

async function main() {
  const env = loadEnv();

  // Run migrations before starting the server. Use ADMIN_DATABASE_URL when
  // available (DDL-capable superuser); fall back to DATABASE_URL which
  // Railway's managed Postgres provides with superuser access by default.
  const migrationUrl = env.ADMIN_DATABASE_URL ?? env.DATABASE_URL;
  const migrationPool = new Pool({ connectionString: migrationUrl });
  try {
    const applied = await runMigrations(migrationPool);
    if (applied.length > 0) {
      console.log(`Migrations applied: ${applied.join(", ")}`);
    } else {
      console.log("DB schema up to date.");
    }
  } finally {
    await migrationPool.end();
  }

  const tenantDb = createTenantAwareDb(env.DATABASE_URL);
  const smsProvider = createSmsProvider(env.SMS_PROVIDER);
  // Payment webhooks and bank-account approvals need cross-tenant reads on
  // RLS-protected tables, so they run on the elevated connection.
  const superAdminPool = createPool(env.ADMIN_DATABASE_URL ?? env.DATABASE_URL);
  const superAdminDb = createDb(superAdminPool);
  const paymentProvider = createPaymentProvider(env.PAYMENT_PROVIDER, env.PAYMENT_WEBHOOK_SECRET);
  const app = buildApp({
    tenantDb,
    superAdminDb,
    jwtSecret: env.JWT_SECRET,
    smsProvider,
    paymentProvider,
    integrationEncryptionKey: env.INTEGRATION_ENCRYPTION_KEY,
    chatClassifier: env.CHAT_CLASSIFIER,
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void app
        .close()
        .then(() => Promise.all([tenantDb.pool.end(), superAdminPool.end()]))
        .then(() => process.exit(0));
    });
  }

  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
