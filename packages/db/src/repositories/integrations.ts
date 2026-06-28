import { eq } from "drizzle-orm";
import { integrationConfigs } from "../schema.js";
import type { Database } from "../index.js";

export interface CreateIntegrationConfigInput {
  societyId: string;
  connectorType: string;
  encryptedCredentials?: string;
  fieldMappings?: Record<string, string>;
  enabledEvents?: string[];
  isActive?: boolean;
}

export async function createIntegrationConfig(db: Database, input: CreateIntegrationConfigInput) {
  const [row] = await db
    .insert(integrationConfigs)
    .values({
      societyId: input.societyId,
      connectorType: input.connectorType,
      encryptedCredentials: input.encryptedCredentials ?? "",
      fieldMappings: input.fieldMappings ?? {},
      enabledEvents: input.enabledEvents ?? [],
      isActive: input.isActive ?? true,
    })
    .returning();
  return row!;
}

export async function listIntegrationConfigs(db: Database) {
  return db
    .select()
    .from(integrationConfigs)
    .orderBy(integrationConfigs.createdAt);
}

export async function findIntegrationConfigById(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(integrationConfigs)
    .where(eq(integrationConfigs.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateIntegrationConfig(
  db: Database,
  id: string,
  input: Partial<{
    encryptedCredentials: string;
    fieldMappings: Record<string, string>;
    enabledEvents: string[];
    isActive: boolean;
  }>,
) {
  const [row] = await db
    .update(integrationConfigs)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(integrationConfigs.id, id))
    .returning();
  return row ?? null;
}

export async function findActiveConfigsForEvent(db: Database, eventType: string) {
  const all = await db
    .select()
    .from(integrationConfigs)
    .where(eq(integrationConfigs.isActive, true));
  return all.filter((c) => {
    const events = c.enabledEvents as string[];
    return Array.isArray(events) && events.includes(eventType);
  });
}
