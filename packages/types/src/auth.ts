import { z } from "zod";

export const roleNameSchema = z.enum([
  "platform_super_admin",
  "society_admin",
  "society_accountant",
  "facility_manager",
  "resident_owner",
  "resident_tenant",
  "resident_family",
]);
export type RoleName = z.infer<typeof roleNameSchema>;

export const mobileSchema = z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid mobile number");
export const otpCodeSchema = z.string().regex(/^\d{6}$/, "OTP code must be 6 digits");

export const residentOtpRequestSchema = z.object({ mobile: mobileSchema });
export type ResidentOtpRequestInput = z.infer<typeof residentOtpRequestSchema>;

export const residentOtpVerifySchema = z.object({ mobile: mobileSchema, code: otpCodeSchema });
export type ResidentOtpVerifyInput = z.infer<typeof residentOtpVerifySchema>;

export const adminOtpRequestSchema = z.object({ email: z.string().email() });
export type AdminOtpRequestInput = z.infer<typeof adminOtpRequestSchema>;

export const adminOtpVerifySchema = z.object({ email: z.string().email(), code: otpCodeSchema });
export type AdminOtpVerifyInput = z.infer<typeof adminOtpVerifySchema>;

export const refreshTokenRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshTokenRequestInput = z.infer<typeof refreshTokenRequestSchema>;

export const principalSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["resident", "admin"]),
  societyId: z.string().uuid().nullable(),
  role: roleNameSchema,
  name: z.string(),
  identifier: z.string(),
});
export type Principal = z.infer<typeof principalSchema>;
