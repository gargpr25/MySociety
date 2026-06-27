import { loadEnv } from "@mysociety/config";
import { buildApp } from "./app.js";
import { createTenantAwareDb } from "./db.js";

async function main() {
  const env = loadEnv();
  const tenantDb = createTenantAwareDb(env.DATABASE_URL);
  const app = buildApp({ tenantDb });
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
