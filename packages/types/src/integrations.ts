import { z } from "zod";

const EVENT_TYPES = ["bill.generated", "payment.captured", "ticket.created", "ticket.resolved"] as const;

export const createIntegrationConfigSchema = z.object({
  connectorType: z.enum(["generic_webhook", "csv_export"]),
  credentials: z.record(z.string()),
  fieldMappings: z.record(z.string()).default({}),
  enabledEvents: z.array(z.enum(EVENT_TYPES)).min(1),
  isActive: z.boolean().default(true),
});

export const updateIntegrationConfigSchema = z.object({
  credentials: z.record(z.string()).optional(),
  fieldMappings: z.record(z.string()).optional(),
  enabledEvents: z.array(z.enum(EVENT_TYPES)).optional(),
  isActive: z.boolean().optional(),
});

export type CreateIntegrationConfigBody = z.infer<typeof createIntegrationConfigSchema>;
export type UpdateIntegrationConfigBody = z.infer<typeof updateIntegrationConfigSchema>;
