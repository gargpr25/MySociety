import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const validEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/mysociety",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "dev-only-not-a-real-secret",
};

describe("loadEnv", () => {
  it("parses a valid environment with defaults applied", () => {
    const env = loadEnv(validEnv);
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.SEED_ENABLED).toBe(false);
    expect(env.SMS_PROVIDER).toBe("console");
    expect(env.PAYMENT_PROVIDER).toBe("fake");
  });

  it("throws on missing required values", () => {
    expect(() => loadEnv({})).toThrow();
  });

  it("throws on a JWT secret that is too short", () => {
    expect(() => loadEnv({ ...validEnv, JWT_SECRET: "short" })).toThrow();
  });
});
