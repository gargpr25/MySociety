import { createHmac } from "node:crypto";
import type { CanonicalEvent } from "@mysociety/types";

export interface WebhookCredentials {
  url: string;
  secret?: string;
}

function applyFieldMappings(
  event: CanonicalEvent,
  fieldMappings: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...event };
  for (const [from, to] of Object.entries(fieldMappings)) {
    if (from in result) {
      result[to] = result[from];
      delete result[from];
    }
  }
  return result;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dispatchWebhook(
  event: CanonicalEvent,
  credentials: WebhookCredentials,
  fieldMappings: Record<string, string>,
  maxRetries = 3,
): Promise<void> {
  const payload = applyFieldMappings(event, fieldMappings);
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (credentials.secret) {
    const sig = createHmac("sha256", credentials.secret).update(body).digest("hex");
    headers["X-Signature-256"] = `sha256=${sig}`;
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await sleep(200 * Math.pow(2, attempt - 1));
    try {
      const res = await fetch(credentials.url, { method: "POST", headers, body });
      if (res.ok) return;
      lastError = new Error(`Webhook returned HTTP ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Fetch failed");
    }
  }
  throw lastError ?? new Error("Webhook dispatch failed");
}

export { applyFieldMappings };
