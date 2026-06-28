import { z } from "zod";

export const createResourceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).default(""),
  capacity: z.number().int().min(1).max(100).default(1),
  slotRules: z.object({
    durationMinutes: z.number().int().min(15).max(1440).optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  }).default({}),
});
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = createResourceSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

export const createBookingSchema = z.object({
  resourceId: z.string().uuid(),
  unitId: z.string().uuid(),
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const createParkingAllocationSchema = z.object({
  spotId: z.string().uuid(),
  unitId: z.string().uuid(),
  period: z.string().min(4).max(7),
  rentAmount: z.number().min(0).default(0),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  cycleId: z.string().uuid().optional(),
  dueDate: z.string().optional(),
});
export type CreateParkingAllocationInput = z.infer<typeof createParkingAllocationSchema>;
