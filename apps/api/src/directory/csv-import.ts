import { parse } from "csv-parse/sync";
import {
  createParkingSpot,
  createResident,
  createTower,
  createUnit,
  createUnitResident,
  findParkingSpotByNo,
  findResidentByMobile,
  findRoleByName,
  findTowerByName,
  findUnitByFlatNo,
  findUnitResident,
  type Database,
} from "@mysociety/db";
import { csvImportRowSchema, type CsvImportReport, type CsvRowError } from "@mysociety/types";

export interface ParsedCsvRow {
  /** 1-based; the first data row after the header is row 1. */
  rowNumber: number;
  data: Record<string, string>;
}

export function parseCsv(content: string): { rows: ParsedCsvRow[]; parseErrors: CsvRowError[] } {
  let records: Record<string, string>[];
  try {
    records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return {
      rows: [],
      parseErrors: [{ row: 0, message: `Failed to parse CSV: ${(err as Error).message}` }],
    };
  }
  return { rows: records.map((data, i) => ({ rowNumber: i + 1, data })), parseErrors: [] };
}

interface ValidatedRow {
  rowNumber: number;
  tower: string;
  flatNo: string;
  carpetArea: number;
  ownerName: string;
  ownerMobile: string;
  tenantName?: string;
  tenantMobile?: string;
  parkingSpots: string[];
}

function validateRows(rows: ParsedCsvRow[]): { validRows: ValidatedRow[]; errors: CsvRowError[] } {
  const errors: CsvRowError[] = [];
  const validRows: ValidatedRow[] = [];

  for (const { rowNumber, data } of rows) {
    const parsed = csvImportRowSchema.safeParse(data);
    if (!parsed.success) {
      errors.push({ row: rowNumber, message: parsed.error.issues.map((i) => i.message).join("; ") });
      continue;
    }
    const row = parsed.data;
    const tenantName = row.tenant_name?.trim() || undefined;
    const tenantMobile = row.tenant_mobile?.trim() || undefined;
    if ((tenantName && !tenantMobile) || (!tenantName && tenantMobile)) {
      errors.push({
        row: rowNumber,
        message: "tenant_name and tenant_mobile must both be provided or both left empty",
      });
      continue;
    }
    if (tenantMobile && tenantMobile === row.owner_mobile) {
      errors.push({ row: rowNumber, message: "owner_mobile and tenant_mobile must not be the same" });
      continue;
    }

    const parkingSpots = (row.parking_spots ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    validRows.push({
      rowNumber,
      tower: row.tower,
      flatNo: row.flat_no,
      carpetArea: row.carpet_area,
      ownerName: row.owner_name,
      ownerMobile: row.owner_mobile,
      tenantName,
      tenantMobile,
      parkingSpots,
    });
  }

  return { validRows, errors };
}

/**
 * Catches issues that only show up when comparing rows to each other:
 * duplicate (tower, flat_no), the same mobile attached to conflicting names
 * (a landlord reusing one mobile across units is fine as long as the name
 * matches every time), and duplicate parking spot numbers.
 */
function checkCrossRowConsistency(validRows: ValidatedRow[]): { rows: ValidatedRow[]; errors: CsvRowError[] } {
  const errors: CsvRowError[] = [];
  const seenUnits = new Map<string, number>();
  const seenMobileNames = new Map<string, { name: string; row: number }>();
  const seenSpotNos = new Map<string, number>();
  const badRows = new Set<number>();

  for (const row of validRows) {
    const unitKey = `${row.tower}::${row.flatNo}`;
    const existingUnitRow = seenUnits.get(unitKey);
    if (existingUnitRow !== undefined) {
      errors.push({
        row: row.rowNumber,
        message: `Duplicate row for tower "${row.tower}" flat "${row.flatNo}" (first seen at row ${existingUnitRow})`,
      });
      badRows.add(row.rowNumber);
      continue;
    }
    seenUnits.set(unitKey, row.rowNumber);

    const mobileNamePairs: Array<[string, string]> = [[row.ownerMobile, row.ownerName]];
    if (row.tenantMobile && row.tenantName) {
      mobileNamePairs.push([row.tenantMobile, row.tenantName]);
    }
    for (const [mobile, name] of mobileNamePairs) {
      const prior = seenMobileNames.get(mobile);
      if (prior && prior.name !== name) {
        errors.push({
          row: row.rowNumber,
          message: `Mobile ${mobile} is associated with conflicting names "${prior.name}" (row ${prior.row}) and "${name}"`,
        });
        badRows.add(row.rowNumber);
      } else if (!prior) {
        seenMobileNames.set(mobile, { name, row: row.rowNumber });
      }
    }

    for (const spotNo of row.parkingSpots) {
      const prior = seenSpotNos.get(spotNo);
      if (prior !== undefined) {
        errors.push({
          row: row.rowNumber,
          message: `Duplicate parking spot "${spotNo}" (first seen at row ${prior})`,
        });
        badRows.add(row.rowNumber);
      } else {
        seenSpotNos.set(spotNo, row.rowNumber);
      }
    }
  }

  return { rows: validRows.filter((r) => !badRows.has(r.rowNumber)), errors };
}

/**
 * Validates + (optionally) applies a CSV import inside the caller's tenant
 * transaction. dryRun never writes. In confirm mode (dryRun: false), writes
 * only happen if there are zero errors across the whole file — an import
 * with any bad row is rejected wholesale, never partially applied.
 */
export async function processCsvImport(
  tx: Database,
  societyId: string,
  csvContent: string,
  options: { dryRun: boolean },
): Promise<CsvImportReport> {
  const { rows, parseErrors } = parseCsv(csvContent);
  const { validRows: schemaValidRows, errors: schemaErrors } = validateRows(rows);
  const { rows: consistentRows, errors: consistencyErrors } = checkCrossRowConsistency(schemaValidRows);
  const errors = [...parseErrors, ...schemaErrors, ...consistencyErrors].sort((a, b) => a.row - b.row);

  const shouldWrite = !options.dryRun && errors.length === 0;

  const ownerRole = await findRoleByName(tx, "resident_owner");
  const tenantRole = await findRoleByName(tx, "resident_tenant");
  if (!ownerRole || !tenantRole) {
    throw new Error("resident_owner/resident_tenant roles not seeded; auth migration not applied?");
  }

  const towerIds = new Map<string, string>();
  const unitIds = new Map<string, string>();
  const residentIds = new Map<string, string>();

  let wouldCreateUnits = 0;
  let wouldCreateResidents = 0;
  let wouldCreateUnitResidents = 0;
  let wouldCreateParkingSpots = 0;

  for (const row of consistentRows) {
    let towerId = towerIds.get(row.tower);
    if (!towerId) {
      const existingTower = await findTowerByName(tx, row.tower);
      if (existingTower) {
        towerId = existingTower.id;
      } else if (shouldWrite) {
        const created = await createTower(tx, { societyId, name: row.tower });
        if (!created) throw new Error(`Failed to create tower ${row.tower}`);
        towerId = created.id;
      }
      if (towerId) towerIds.set(row.tower, towerId);
    }

    const unitKey = `${row.tower}::${row.flatNo}`;
    let unitId = towerId ? (await findUnitByFlatNo(tx, towerId, row.flatNo))?.id : undefined;
    if (!unitId) {
      wouldCreateUnits++;
      if (shouldWrite) {
        if (!towerId) throw new Error("internal: tower must exist before creating a unit");
        const created = await createUnit(tx, {
          societyId,
          towerId,
          flatNo: row.flatNo,
          type: row.carpetArea >= 1100 ? "3bhk" : "2bhk",
          carpetArea: row.carpetArea,
        });
        if (!created) throw new Error(`Failed to create unit ${row.flatNo}`);
        unitId = created.id;
      }
    }
    if (unitId) unitIds.set(unitKey, unitId);

    const residentEntries: Array<{ name: string; mobile: string; relationship: "owner" | "tenant" }> = [
      { name: row.ownerName, mobile: row.ownerMobile, relationship: "owner" },
    ];
    if (row.tenantMobile && row.tenantName) {
      residentEntries.push({ name: row.tenantName, mobile: row.tenantMobile, relationship: "tenant" });
    }

    for (const entry of residentEntries) {
      let residentId = residentIds.get(entry.mobile);
      if (!residentId) {
        const existing = await findResidentByMobile(tx, entry.mobile);
        if (existing) {
          residentId = existing.id;
        } else {
          wouldCreateResidents++;
          if (shouldWrite) {
            const role = entry.relationship === "owner" ? ownerRole : tenantRole;
            const created = await createResident(tx, {
              societyId,
              roleId: role.id,
              name: entry.name,
              mobile: entry.mobile,
              isPrimary: true,
            });
            if (!created) throw new Error(`Failed to create resident ${entry.mobile}`);
            residentId = created.id;
          }
        }
        if (residentId) residentIds.set(entry.mobile, residentId);
      }

      if (unitId && residentId) {
        const existingLink = await findUnitResident(tx, unitId, residentId);
        if (!existingLink) {
          wouldCreateUnitResidents++;
          if (shouldWrite) {
            await createUnitResident(tx, {
              societyId,
              unitId,
              residentId,
              relationship: entry.relationship,
              isPrimary: entry.relationship === "owner",
            });
          }
        }
      } else {
        // Dry run with a unit and/or resident that doesn't exist yet: still
        // a planned new link once both are created.
        wouldCreateUnitResidents++;
      }
    }

    for (const spotNo of row.parkingSpots) {
      const existingSpot = await findParkingSpotByNo(tx, societyId, spotNo);
      if (!existingSpot) {
        wouldCreateParkingSpots++;
        if (shouldWrite && unitId) {
          await createParkingSpot(tx, { societyId, spotNo, unitId });
        }
      }
    }
  }

  return {
    totalRows: rows.length,
    errors,
    wouldCreateUnits,
    wouldCreateResidents,
    wouldCreateUnitResidents,
    wouldCreateParkingSpots,
    applied: shouldWrite,
  };
}
