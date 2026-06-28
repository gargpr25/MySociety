import { createSmsProvider, loadEnv } from "@mysociety/config";
import { buildApp } from "./app.js";
import { createTenantAwareDb } from "./db.js";

async function main() {
  const env = loadEnv();
  const tenantDb = createTenantAwareDb(env.DATABASE_URL);
  const smsProvider = createSmsProvider(env.SMS_PROVIDER);
  const app = buildApp({
    tenantDb,
    jwtSecret: env.JWT_SECRET,
    smsProvider,
    integrationEncryptionKey: env.INTEGRATION_ENCRYPTION_KEY,
  });
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
