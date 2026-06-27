import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { societies, towers, units } from '@mysociety/db/schema';
import { env } from '@mysociety/config';

async function seed() {
  if (!env.SEED_ENABLED) {
    console.log('Seed disabled, skipping...');
    return;
  }

  console.log('Seeding database...');
  const queryClient = postgres(env.DATABASE_URL);
  const db = drizzle(queryClient);

  try {
    // Check if seeded
    const existing = await db.select().from(societies).limit(1);
    if (existing.length > 0) {
      console.log('Already seeded');
      process.exit(0);
    }

    const [society] = await db.insert(societies).values({
      name: 'Test Society',
      address: { city: 'Test City' },
    }).returning({ id: societies.id });

    const [tower1, tower2] = await db.insert(towers).values([
      { society_id: society.id, name: 'Tower A' },
      { society_id: society.id, name: 'Tower B' },
    ]).returning({ id: towers.id });

    const unitValues = [];
    for (let i = 1; i <= 5; i++) {
      unitValues.push({ society_id: society.id, tower_id: tower1.id, flat_no: `${i}01`, carpet_area: '1000' });
      unitValues.push({ society_id: society.id, tower_id: tower2.id, flat_no: `${i}01`, carpet_area: '1200' });
    }

    await db.insert(units).values(unitValues);

    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    await queryClient.end();
  }
}

seed();
