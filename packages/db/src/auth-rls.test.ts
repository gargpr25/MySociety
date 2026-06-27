import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { runMigrations } from "./migrate.js";
import { createAdminUser, findAdminByEmailAcrossTenants } from "./repositories/admin-users.js";
import { findRoleByName } from "./repositories/roles.js";
import {
  createResident,
  findResidentByMobile,
  findResidentsByMobileAcrossTenants,
} from "./repositories/residents.js";
import { createSociety } from "./repositories/societies.js";
import { withTenantContext } from "./tenant-context.js";

const adminUrl =
  process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/mysociety_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test";

let adminPool: Pool;
let appPool: Pool;
let appDb: Database;
const createdSocietyIds: string[] = [];

// Date.now() alone collides easily across calls a few ms apart once
// truncated to fit the 15-digit mobile format; pad with randomness instead.
function uniqueMobile(): string {
  return `9${Math.floor(100_000_000 + Math.random() * 800_000_000)}`;
}

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl });
  await runMigrations(adminPool);
  appPool = new Pool({ connectionString: appUrl });
  appDb = createDb(appPool);
});

afterAll(async () => {
  if (createdSocietyIds.length > 0) {
    await adminPool.query("DELETE FROM societies WHERE id = ANY($1)", [createdSocietyIds]);
  }
  await adminPool.end();
  await appPool.end();
});

describe("residents/admin_users Row-Level Security", () => {
  it("only returns residents belonging to the current tenant", async () => {
    const adminDb = createDb(adminPool);
    const societyA = await createSociety(adminDb, { name: `Auth RLS Society A ${Date.now()}` });
    const societyB = await createSociety(adminDb, { name: `Auth RLS Society B ${Date.now()}` });
    if (!societyA || !societyB) throw new Error("failed to create test societies");
    createdSocietyIds.push(societyA.id, societyB.id);

    const ownerRole = await findRoleByName(adminDb, "resident_owner");
    if (!ownerRole) throw new Error("resident_owner role not seeded");

    await withTenantContext(appDb, societyA.id, async (tx) => {
      await createResident(tx, {
        societyId: societyA.id,
        roleId: ownerRole.id,
        name: "Resident A",
        mobile: uniqueMobile(),
      });
    });

    const mobileB = uniqueMobile();
    await withTenantContext(appDb, societyB.id, async (tx) => {
      await createResident(tx, {
        societyId: societyB.id,
        roleId: ownerRole.id,
        name: "Resident B",
        mobile: mobileB,
      });
    });

    await withTenantContext(appDb, societyA.id, async (tx) => {
      const visible = await findResidentByMobile(tx, mobileB);
      expect(visible).toBeUndefined();
    });
  });

  it("rejects writes whose society_id does not match the current tenant context", async () => {
    const adminDb = createDb(adminPool);
    const societyA = await createSociety(adminDb, { name: `Auth RLS Write A ${Date.now()}` });
    const societyB = await createSociety(adminDb, { name: `Auth RLS Write B ${Date.now()}` });
    if (!societyA || !societyB) throw new Error("failed to create test societies");
    createdSocietyIds.push(societyA.id, societyB.id);

    const ownerRole = await findRoleByName(adminDb, "resident_owner");
    if (!ownerRole) throw new Error("resident_owner role not seeded");

    await expect(
      withTenantContext(appDb, societyA.id, async (tx) => {
        await createResident(tx, {
          societyId: societyB.id,
          roleId: ownerRole.id,
          name: "Illegal cross-tenant resident",
          mobile: uniqueMobile(),
        });
      }),
    ).rejects.toThrow();
  });

  it("resolves a resident's society via the SECURITY DEFINER lookup before any tenant context exists", async () => {
    const adminDb = createDb(adminPool);
    const society = await createSociety(adminDb, { name: `Auth RLS Lookup ${Date.now()}` });
    if (!society) throw new Error("failed to create test society");
    createdSocietyIds.push(society.id);

    const ownerRole = await findRoleByName(adminDb, "resident_owner");
    if (!ownerRole) throw new Error("resident_owner role not seeded");

    const mobile = uniqueMobile();
    await withTenantContext(appDb, society.id, async (tx) => {
      await createResident(tx, {
        societyId: society.id,
        roleId: ownerRole.id,
        name: "Lookup Resident",
        mobile,
      });
    });

    // No SET LOCAL app.current_society_id at all: simulates pre-auth state.
    const found = await findResidentsByMobileAcrossTenants(appDb, mobile);
    expect(found).toHaveLength(1);
    expect(found[0]?.societyId).toBe(society.id);
  });

  it("allows a platform_super_admin row (NULL society_id) to be visible regardless of tenant context", async () => {
    const adminDb = createDb(adminPool);
    const superAdminRole = await findRoleByName(adminDb, "platform_super_admin");
    if (!superAdminRole) throw new Error("platform_super_admin role not seeded");

    const email = `super-${Date.now()}@example.com`;
    await createAdminUser(adminDb, {
      societyId: null,
      roleId: superAdminRole.id,
      email,
      name: "Platform Super Admin",
    });

    const found = await findAdminByEmailAcrossTenants(appDb, email);
    expect(found).toHaveLength(1);
    expect(found[0]?.societyId).toBeNull();

    await adminPool.query("DELETE FROM admin_users WHERE email = $1", [email]);
  });
});
