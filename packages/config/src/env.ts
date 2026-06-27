import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  // Runtime app-role connection (non-superuser, RLS-enforced). Used by the
  // API, the seed CLI, and anything reading/writing tenant-scoped tables.
  DATABASE_URL: z.string().url(),
  // Elevated connection used only by the migration runner (DDL, role/grant
  // management). Never used for tenant-scoped reads/writes.
  ADMIN_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  SEED_ENABLED: z.coerce.boolean().default(false),
  SMS_PROVIDER: z.enum(["console"]).default("console"),
  PAYMENT_PROVIDER: z.enum(["fake"]).default("fake"),
  JWT_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
