import { appendFile, writeFile, access } from "node:fs/promises";
import type { CanonicalEvent } from "@mysociety/types";
import { applyFieldMappings } from "./webhook.js";

export interface CsvExportCredentials {
  path: string;
}

export async function dispatchCsvExport(
  event: CanonicalEvent,
  credentials: CsvExportCredentials,
  fieldMappings: Record<string, string>,
): Promise<void> {
  const payload = applyFieldMappings(event, fieldMappings);
  const keys = Object.keys(payload);
  const values = keys.map((k) => {
    const v = payload[k];
    if (v === null || v === undefined) return "";
    const str = String(v);
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  });
  const row = values.join(",") + "\n";

  let fileExists = false;
  try {
    await access(credentials.path);
    fileExists = true;
  } catch {
    fileExists = false;
  }

  if (!fileExists) {
    const header = keys.join(",") + "\n";
    await writeFile(credentials.path, header + row, "utf8");
  } else {
    await appendFile(credentials.path, row, "utf8");
  }
}
