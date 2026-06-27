import { describe, expect, it } from "vitest";
import { societySchema, towerSchema, unitSchema } from "./tenancy.js";

describe("societySchema", () => {
  it("accepts a valid society", () => {
    const result = societySchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Green Meadows",
      address: { city: "Gurgaon" },
      config: {},
      onboardingStatus: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid onboardingStatus", () => {
    const result = societySchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Green Meadows",
      address: {},
      config: {},
      onboardingStatus: "not-a-status",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe("towerSchema", () => {
  it("rejects a non-uuid societyId", () => {
    const result = towerSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      societyId: "not-a-uuid",
      name: "Tower A",
    });
    expect(result.success).toBe(false);
  });
});

describe("unitSchema", () => {
  it("rejects a non-positive carpetArea", () => {
    const result = unitSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      societyId: "11111111-1111-1111-1111-111111111111",
      towerId: "11111111-1111-1111-1111-111111111111",
      flatNo: "A-101",
      type: "2bhk",
      carpetArea: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid unit", () => {
    const result = unitSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      societyId: "11111111-1111-1111-1111-111111111111",
      towerId: "11111111-1111-1111-1111-111111111111",
      flatNo: "A-101",
      type: "2bhk",
      carpetArea: 850,
    });
    expect(result.success).toBe(true);
  });
});
