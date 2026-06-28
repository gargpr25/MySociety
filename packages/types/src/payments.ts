import { z } from "zod";

export const createPaymentOrderSchema = z.object({
  billId: z.string().uuid(),
});

export const createBankAccountSchema = z.object({
  accountName: z.string().min(1),
  accountNumber: z.string().min(8).max(20),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
  bankName: z.string().min(1),
});

export const approveBankAccountSchema = z.object({
  societyId: z.string().uuid(),
});

export const rejectBankAccountSchema = z.object({
  reason: z.string().min(1),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type ApproveBankAccountInput = z.infer<typeof approveBankAccountSchema>;
export type RejectBankAccountInput = z.infer<typeof rejectBankAccountSchema>;
