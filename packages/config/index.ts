import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SEED_ENABLED: z.string().optional().transform(val => val === 'true'),
  SMS_PROVIDER: z.string().optional().default('console'),
  PAYMENT_PROVIDER: z.string().optional().default('fake'),
  JWT_SECRET: z.string().min(1),
});

export const env = envSchema.parse(process.env);
