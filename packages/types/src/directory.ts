import { z } from "zod";
import { mobileSchema } from "./auth.js";

export const relationshipSchema = z.enum(["owner", "tenant", "family"]);
export type Relationship = z.infer<typeof relationshipSchema>;

/**
 * One row of the documented CSV import template:
 * tower, flat_no, carpet_area, owner_name, owner_mobile, tenant_name,
 * tenant_mobile, parking_spots. owner_* is required; tenant_* and
 * parking_spots are optional. parking_spots is semicolon-separated (not
 * comma-separated) since the cell itself sits inside a comma-delimited CSV.
 */
export const csvImportRowSchema = z.object({
  tower: z.string().trim().min(1, "tower is required"),
  flat_no: z.string().trim().min(1, "flat_no is required"),
  carpet_area: z.coerce.number().positive("carpet_area must be a positive number"),
  owner_name: z.string().trim().min(1, "owner_name is required"),
  owner_mobile: mobileSchema,
  tenant_name: z.string().trim().optional().or(z.literal("")),
  tenant_mobile: z.union([mobileSchema, z.literal("")]).optional(),
  parking_spots: z.string().trim().optional().or(z.literal("")),
});
export type CsvImportRow = z.infer<typeof csvImportRowSchema>;

export interface CsvRowError {
  row: number;
  message: string;
}

export interface CsvImportReport {
  totalRows: number;
  errors: CsvRowError[];
  wouldCreateUnits: number;
  wouldCreateResidents: number;
  wouldCreateUnitResidents: number;
  wouldCreateParkingSpots: number;
  applied: boolean;
}

export const createUnitInputSchema = z.object({
  towerId: z.string().uuid(),
  flatNo: z.string().trim().min(1),
  type: z.string().trim().min(1),
  carpetArea: z.coerce.number().positive(),
});
export type CreateUnitInput = z.infer<typeof createUnitInputSchema>;

export const updateUnitInputSchema = createUnitInputSchema
  .omit({ towerId: true })
  .partial();
export type UpdateUnitInput = z.infer<typeof updateUnitInputSchema>;

export const addUnitResidentInputSchema = z.object({
  name: z.string().trim().min(1),
  mobile: mobileSchema,
  relationship: relationshipSchema,
  isPrimary: z.boolean().optional(),
  canPay: z.boolean().optional(),
});
export type AddUnitResidentInput = z.infer<typeof addUnitResidentInputSchema>;

export const updateUnitResidentInputSchema = z.object({
  relationship: relationshipSchema.optional(),
  isPrimary: z.boolean().optional(),
  canPay: z.boolean().optional(),
});
export type UpdateUnitResidentInput = z.infer<typeof updateUnitResidentInputSchema>;
