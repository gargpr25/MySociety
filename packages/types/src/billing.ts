import { z } from "zod";

export const computeRuleSchema = z.enum(["fixed", "per_sqft", "metered", "flat_per_unit"]);
export type ComputeRule = z.infer<typeof computeRuleSchema>;

export const taxRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("percentage"), rate: z.number().min(0).max(100) }),
  z.object({ type: z.literal("fixed"), amount: z.number().min(0) }),
]);
export type TaxRule = z.infer<typeof taxRuleSchema>;

export const billStatusSchema = z.enum(["unpaid", "partial", "paid", "overdue"]);
export type BillStatus = z.infer<typeof billStatusSchema>;

export const cycleStatusSchema = z.enum(["draft", "published", "closed"]);
export type CycleStatus = z.infer<typeof cycleStatusSchema>;

// ── API input schemas ──────────────────────────────────────────────────────────

export const createBillHeadSchema = z.object({
  name: z.string().min(1),
  computeRule: computeRuleSchema,
  rate: z.number().min(0),
  taxRule: taxRuleSchema.default({ type: "none" }),
});
export type CreateBillHeadInput = z.infer<typeof createBillHeadSchema>;

export const updateBillHeadSchema = createBillHeadSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateBillHeadInput = z.infer<typeof updateBillHeadSchema>;

export const createBillingCycleSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be YYYY-MM"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD"),
  lateFeeRule: z
    .union([
      z.object({ type: z.literal("none") }),
      z.object({ type: z.literal("percentage"), rate: z.number().min(0), afterDays: z.number().int().min(1) }),
      z.object({ type: z.literal("fixed"), amount: z.number().min(0), afterDays: z.number().int().min(1) }),
    ])
    .default({ type: "none" }),
});
export type CreateBillingCycleInput = z.infer<typeof createBillingCycleSchema>;

export const upsertMeterReadingSchema = z.object({
  unitId: z.string().uuid(),
  headId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  prevReading: z.number().min(0).default(0),
  currentReading: z.number().min(0),
});
export type UpsertMeterReadingInput = z.infer<typeof upsertMeterReadingSchema>;

// ── Response types ─────────────────────────────────────────────────────────────

export type BillHead = {
  id: string;
  societyId: string;
  name: string;
  computeRule: string;
  rate: number;
  taxRule: TaxRule;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillingCycle = {
  id: string;
  societyId: string;
  period: string;
  dueDate: string;
  status: string;
  lateFeeRule: object;
  createdAt: string;
  updatedAt: string;
};

export type Bill = {
  id: string;
  societyId: string;
  unitId: string;
  cycleId: string;
  dueDate: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  arrearsCarryForward: number;
  totalDue: number;
  paidAmount: number;
  createdAt: string;
  updatedAt: string;
};

export type BillLineItem = {
  id: string;
  billId: string;
  headId: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  taxAmount: number;
};

export type CollectionSummary = {
  period: string;
  cycleId: string;
  status: string;
  totalBills: number;
  paid: number;
  partial: number;
  overdue: number;
  unpaid: number;
  totalDue: number;
  totalCollected: number;
};
