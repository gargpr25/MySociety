import { Pool } from "pg";
import { createSmsProvider, loadEnv } from "@mysociety/config";
import { runMigrations } from "@mysociety/db";
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
  const app = buildApp({
    tenantDb,
    jwtSecret: env.JWT_SECRET,
    smsProvider,
    integrationEncryptionKey: env.INTEGRATION_ENCRYPTION_KEY,
    chatClassifier: env.CHAT_CLASSIFIER,
  });
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
