/**
 * Documented CSV template for bulk resident-directory import. One row per
 * unit. owner_* is required; tenant_* and parking_spots are optional.
 * parking_spots uses ";" to separate multiple spot numbers, since "," is
 * already the CSV cell delimiter.
 */
export const CSV_TEMPLATE_COLUMNS = [
  "tower",
  "flat_no",
  "carpet_area",
  "owner_name",
  "owner_mobile",
  "tenant_name",
  "tenant_mobile",
  "parking_spots",
] as const;

export const CSV_TEMPLATE_EXAMPLE_ROWS = [
  ["Tower 1", "101", "950", "Asha Sharma", "9810000001", "", "", "P-101"],
  ["Tower 1", "102", "1250", "Vikram Mehta", "9810000002", "Priya Nair", "9810000003", "P-102;P-103"],
];

export function buildCsvTemplate(): string {
  const lines = [CSV_TEMPLATE_COLUMNS.join(",")];
  for (const row of CSV_TEMPLATE_EXAMPLE_ROWS) {
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}
