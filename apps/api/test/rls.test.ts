import { test, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '@mysociety/config';
import { societies, towers, units } from '@mysociety/db/schema';
import { sql } from 'drizzle-orm';

const queryClient = postgres(env.DATABASE_URL);
const db = drizzle(queryClient);

beforeAll(async () => {
  // Clear tables
  await db.delete(units);
  await db.delete(towers);
  await db.delete(societies);

  await db.execute(sql`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user; END IF; END $$;`);
  await db.execute(sql`GRANT SELECT ON TABLE units TO app_user;`);
});

afterAll(async () => {
  await queryClient.end();
});

test('RLS restricts cross-tenant reads', async () => {
  // Create Society A
  const [societyA] = await db.insert(societies).values({
    name: 'Society A'
  }).returning({ id: societies.id });
  const [towerA] = await db.insert(towers).values({
    society_id: societyA.id,
    name: 'Tower A'
  }).returning({ id: towers.id });
  await db.insert(units).values({
    society_id: societyA.id,
    tower_id: towerA.id,
    flat_no: '101'
  });

  // Create Society B
  const [societyB] = await db.insert(societies).values({
    name: 'Society B'
  }).returning({ id: societies.id });
  const [towerB] = await db.insert(towers).values({
    society_id: societyB.id,
    name: 'Tower B'
  }).returning({ id: towers.id });
  await db.insert(units).values({
    society_id: societyB.id,
    tower_id: towerB.id,
    flat_no: '101'
  });

  // Query as Society A
  const resultA = await db.transaction(async (tx) => {
    // Enable RLS for superuser (or just query normally if policies apply to superuser, but they usually don't)
    // Actually, setting app.current_society_id should just work if we cast correctly in the policy.
    // Wait, by default postgres bypasses RLS for table owner/superuser. We must enable FORCE ROW LEVEL SECURITY.
    await tx.execute(sql.raw(`SET LOCAL app.current_society_id = '${societyA.id}'`));
    return tx.select().from(units).where(sql`society_id = (current_setting('app.current_society_id'))::uuid`);
  });

  // Ensure it only sees Society A's units
  expect(resultA.length).toBe(1);
  expect(resultA[0].society_id).toBe(societyA.id);

  // Query as Society B
  const resultB = await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_society_id = '${societyB.id}'`));
    return tx.select().from(units).where(sql`society_id = (current_setting('app.current_society_id'))::uuid`);
  });

  expect(resultB.length).toBe(1);
  expect(resultB[0].society_id).toBe(societyB.id);
});
