import type { FastifyReply, FastifyRequest } from "fastify";
import type { Principal, RoleName } from "@mysociety/types";
import { verifyToken } from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export function authenticate(jwtSecret: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      return reply.code(401).send({ error: "Missing bearer token" });
    }
    try {
      request.principal = verifyToken(jwtSecret, token, "access");
    } catch {
      return reply.code(401).send({ error: "Invalid or expired token" });
    }
  };
}

export function requireRole(...roles: RoleName[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.principal || !roles.includes(request.principal.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  };
}
