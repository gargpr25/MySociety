import { z } from "zod";

export const societySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  address: z.record(z.unknown()),
  config: z.record(z.unknown()),
  onboardingStatus: z.enum(["pending", "active", "suspended"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Society = z.infer<typeof societySchema>;

export const towerSchema = z.object({
  id: z.string().uuid(),
  societyId: z.string().uuid(),
  name: z.string().min(1),
});
export type Tower = z.infer<typeof towerSchema>;

export const unitTypeSchema = z.enum(["1bhk", "2bhk", "3bhk", "4bhk", "penthouse", "studio"]);

export const unitSchema = z.object({
  id: z.string().uuid(),
  societyId: z.string().uuid(),
  towerId: z.string().uuid(),
  flatNo: z.string().min(1),
  type: unitTypeSchema,
  carpetArea: z.number().positive(),
});
export type Unit = z.infer<typeof unitSchema>;
