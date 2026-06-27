import type { FastifyInstance } from "fastify";
import type { SmsProvider } from "@mysociety/config";
import {
  countRecentOtpRequests,
  createOtpRequest,
  findAdminByEmailAcrossTenants,
  findLatestOtpRequest,
  findResidentsByMobileAcrossTenants,
  findRoleById,
  incrementOtpAttempts,
  markOtpConsumed,
} from "@mysociety/db";
import type { TenantAwareDb } from "../db.js";
import {
  adminOtpRequestSchema,
  adminOtpVerifySchema,
  refreshTokenRequestSchema,
  residentOtpRequestSchema,
  residentOtpVerifySchema,
  type Principal,
} from "@mysociety/types";
import { generateOtpCode, hashOtpCode, OTP_MAX_ATTEMPTS, OTP_RATE_LIMIT_MAX_REQUESTS, OTP_RATE_LIMIT_WINDOW_MS, OTP_TTL_MS } from "../auth/otp.js";
import { signAccessToken, signRefreshToken, verifyToken } from "../auth/jwt.js";
import { authenticate } from "../auth/middleware.js";

const RESIDENT_OTP_PURPOSE = "resident_otp";
const ADMIN_OTP_PURPOSE = "admin_otp";

export interface AuthRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
  smsProvider: SmsProvider;
}

async function requestOtp(
  options: AuthRouteOptions,
  purpose: string,
  identifier: string,
): Promise<{ rateLimited: boolean }> {
  const since = new Date(Date.now() - OTP_RATE_LIMIT_WINDOW_MS);
  const recentCount = await countRecentOtpRequests(options.tenantDb.db, purpose, identifier, since);
  if (recentCount >= OTP_RATE_LIMIT_MAX_REQUESTS) {
    return { rateLimited: true };
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(options.jwtSecret, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await createOtpRequest(options.tenantDb.db, { purpose, identifier, codeHash, expiresAt });
  await options.smsProvider.sendOtp(identifier, code);
  return { rateLimited: false };
}

async function verifyOtp(
  options: AuthRouteOptions,
  purpose: string,
  identifier: string,
  code: string,
): Promise<"ok" | "invalid" | "expired" | "too_many_attempts"> {
  const otpRequest = await findLatestOtpRequest(options.tenantDb.db, purpose, identifier);
  if (!otpRequest) return "invalid";
  if (otpRequest.attempts >= OTP_MAX_ATTEMPTS) return "too_many_attempts";
  if (otpRequest.expiresAt.getTime() < Date.now()) return "expired";

  const codeHash = hashOtpCode(options.jwtSecret, code);
  if (codeHash !== otpRequest.codeHash) {
    await incrementOtpAttempts(options.tenantDb.db, otpRequest.id);
    return "invalid";
  }

  await markOtpConsumed(options.tenantDb.db, otpRequest.id);
  return "ok";
}

function otpFailureStatus(result: "invalid" | "expired" | "too_many_attempts"): number {
  return result === "too_many_attempts" ? 429 : 401;
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions) {
  app.post("/auth/otp/request", async (request, reply) => {
    const parsed = residentOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { rateLimited } = await requestOtp(options, RESIDENT_OTP_PURPOSE, parsed.data.mobile);
    if (rateLimited) {
      return reply.code(429).send({ error: "Too many OTP requests, try again later" });
    }
    // Anti-enumeration: always report success, regardless of whether the
    // mobile number belongs to a registered resident.
    return reply.send({ success: true });
  });

  app.post("/auth/otp/verify", async (request, reply) => {
    const parsed = residentOtpVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { mobile, code } = parsed.data;
    const result = await verifyOtp(options, RESIDENT_OTP_PURPOSE, mobile, code);
    if (result !== "ok") {
      return reply.code(otpFailureStatus(result)).send({ error: result });
    }

    const matches = await findResidentsByMobileAcrossTenants(options.tenantDb.db, mobile);
    const resident = matches.find((r) => r.isPrimary) ?? matches[0];
    if (!resident) {
      return reply.code(401).send({ error: "No resident registered with this mobile number" });
    }
    const role = await findRoleById(options.tenantDb.db, resident.roleId);
    if (!role) {
      return reply.code(500).send({ error: "Resident role not found" });
    }

    const principal: Principal = {
      id: resident.id,
      kind: "resident",
      societyId: resident.societyId,
      role: role.name as Principal["role"],
      name: resident.name,
      identifier: resident.mobile,
    };
    return reply.send({
      accessToken: signAccessToken(options.jwtSecret, principal),
      refreshToken: signRefreshToken(options.jwtSecret, principal),
    });
  });

  app.post("/auth/admin/login/request", async (request, reply) => {
    const parsed = adminOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { rateLimited } = await requestOtp(options, ADMIN_OTP_PURPOSE, parsed.data.email);
    if (rateLimited) {
      return reply.code(429).send({ error: "Too many OTP requests, try again later" });
    }
    return reply.send({ success: true });
  });

  app.post("/auth/admin/login/verify", async (request, reply) => {
    const parsed = adminOtpVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const { email, code } = parsed.data;
    const result = await verifyOtp(options, ADMIN_OTP_PURPOSE, email, code);
    if (result !== "ok") {
      return reply.code(otpFailureStatus(result)).send({ error: result });
    }

    const matches = await findAdminByEmailAcrossTenants(options.tenantDb.db, email);
    const admin = matches[0];
    if (!admin) {
      return reply.code(401).send({ error: "No admin registered with this email" });
    }
    const role = await findRoleById(options.tenantDb.db, admin.roleId);
    if (!role) {
      return reply.code(500).send({ error: "Admin role not found" });
    }

    const principal: Principal = {
      id: admin.id,
      kind: "admin",
      societyId: admin.societyId,
      role: role.name as Principal["role"],
      name: admin.name,
      identifier: admin.email,
    };
    return reply.send({
      accessToken: signAccessToken(options.jwtSecret, principal),
      refreshToken: signRefreshToken(options.jwtSecret, principal),
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    let principal: Principal;
    try {
      principal = verifyToken(options.jwtSecret, parsed.data.refreshToken, "refresh");
    } catch {
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }
    return reply.send({
      accessToken: signAccessToken(options.jwtSecret, principal),
      refreshToken: signRefreshToken(options.jwtSecret, principal),
    });
  });

  app.get("/me", { preHandler: authenticate(options.jwtSecret) }, async (request, reply) => {
    return reply.send(request.principal);
  });
}
