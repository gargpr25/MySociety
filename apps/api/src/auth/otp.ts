import { createHmac, randomInt } from "node:crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const OTP_RATE_LIMIT_MAX_REQUESTS = 5;

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Codes are hashed (never stored in plaintext) via HMAC-SHA256 keyed by the
 * JWT secret, reusing an existing secret instead of introducing a dedicated
 * one or a new dependency.
 */
export function hashOtpCode(secret: string, code: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}
