import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "@mysociety/config";
import { Pool } from "pg";

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

// Arbitrary fixed key for the advisory lock below, namespacing it to this
// project so it can't collide with locks taken by other code on the same DB.
const MIGRATION_LOCK_KEY = 727_727_001;

export async function runMigrations(pool: Pool): Promise<string[]> {
  // Test files each call runMigrations() independently against the same
  // database, in parallel vitest workers. Without serializing, two workers
  // can race to apply the same not-yet-recorded migration concurrently,
  // which fails with spurious duplicate-object errors (e.g. on CREATE TABLE
  // IF NOT EXISTS). A session-level advisory lock makes the whole apply
  // step mutually exclusive across connections without needing a real table
  // lock or schema change.
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    return await applyMigrations(pool);
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
    lockClient.release();
  }
}

async function applyMigrations(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      newlyApplied.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  return newlyApplied;
}

async function main() {
  const env = loadEnv();
  const adminUrl = env.ADMIN_DATABASE_URL;
  if (!adminUrl) {
    throw new Error("ADMIN_DATABASE_URL must be set to run migrations.");
  }
  const pool = new Pool({ connectionString: adminUrl });
  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) {
      console.log("No new migrations to apply.");
    } else {
      console.log(`Applied migrations: ${applied.join(", ")}`);
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
