import { Pool } from "pg";
import { loadEnv } from "@mysociety/config";
import { runMigrations } from "@mysociety/db";

const env = loadEnv();
const url = env.ADMIN_DATABASE_URL ?? env.DATABASE_URL;
const pool = new Pool({ connectionString: url });

runMigrations(pool)
  .then((applied) => {
    if (applied.length > 0) {
      console.log(`Applied migrations: ${applied.join(", ")}`);
    } else {
      console.log("DB schema up to date.");
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
