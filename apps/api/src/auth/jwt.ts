import jwt from "jsonwebtoken";
import type { Principal } from "@mysociety/types";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

interface TokenClaims extends Principal {
  typ: "access" | "refresh";
}

export function signAccessToken(secret: string, principal: Principal): string {
  const claims: TokenClaims = { ...principal, typ: "access" };
  return jwt.sign(claims, secret, { expiresIn: ACCESS_TOKEN_TTL, subject: principal.id });
}

export function signRefreshToken(secret: string, principal: Principal): string {
  const claims: TokenClaims = { ...principal, typ: "refresh" };
  return jwt.sign(claims, secret, { expiresIn: REFRESH_TOKEN_TTL, subject: principal.id });
}

export function verifyToken(secret: string, token: string, expectedTyp: "access" | "refresh"): Principal {
  const decoded = jwt.verify(token, secret) as TokenClaims;
  if (decoded.typ !== expectedTyp) {
    throw new Error(`Expected a ${expectedTyp} token`);
  }
  const { typ, ...principal } = decoded;
  return principal;
}
