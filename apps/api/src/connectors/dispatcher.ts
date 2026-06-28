import { decryptValue } from "@mysociety/config";
import { createDispatchLog, findActiveConfigsForEvent } from "@mysociety/db";
import type { CanonicalEvent } from "@mysociety/types";
import type { TenantAwareDb } from "../db.js";
import { dispatchWebhook } from "./webhook.js";
import { dispatchCsvExport } from "./csv-export.js";

export type DispatcherFn = (event: CanonicalEvent) => Promise<void>;

export function createDispatcher(tenantDb: TenantAwareDb, encryptionKey: string): DispatcherFn {
  return async (event: CanonicalEvent): Promise<void> => {
    const configs = await tenantDb.withTenant(event.societyId, (db) =>
      findActiveConfigsForEvent(db, event.type),
    );

    await Promise.allSettled(
      configs.map(async (config) => {
        const startedAt = Date.now();
        let responseBody: string | undefined;
        let errorMessage: string | undefined;
        let status: "success" | "failed" = "success";

        try {
          const credentials: Record<string, string> = config.encryptedCredentials
            ? (JSON.parse(decryptValue(config.encryptedCredentials, encryptionKey)) as Record<string, string>)
            : {};
          const fieldMappings = (config.fieldMappings as Record<string, string>) ?? {};

          if (config.connectorType === "generic_webhook") {
            await dispatchWebhook(event, credentials as { url: string; secret?: string }, fieldMappings);
            responseBody = "ok";
          } else if (config.connectorType === "csv_export") {
            await dispatchCsvExport(event, credentials as { path: string }, fieldMappings);
            responseBody = "ok";
          }
        } catch (err) {
          status = "failed";
          errorMessage = err instanceof Error ? err.message : "Unknown error";
          console.error(
            `[connector] dispatch failed for config ${config.id} (${config.connectorType}):`,
            errorMessage,
          );
        } finally {
          const durationMs = Date.now() - startedAt;
          // Write dispatch log — fire-and-forget, never propagates
          tenantDb.withTenant(event.societyId, (db) =>
            createDispatchLog(db, {
              societyId: event.societyId,
              integrationId: config.id,
              eventType: event.type,
              status,
              payload: { event, durationMs },
              responseBody,
              errorMessage,
            }),
          ).catch(() => undefined);
        }
      }),
    );
  };
}
