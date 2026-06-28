import type { FastifyInstance } from "fastify";
import {
  createResident,
  createUnit,
  createUnitResident,
  deleteUnitResident,
  findResidentByMobile,
  findRoleByName,
  findUnitById,
  findUnitResident,
  listAdminUsers,
  listParkingSpots,
  listParkingSpotsByUnitId,
  listResidentsByUnitId,
  listUnitResidentsByUnitId,
  listUnits,
  updateUnit,
  updateUnitResident,
} from "@mysociety/db";
import {
  addUnitResidentInputSchema,
  createUnitInputSchema,
  updateUnitInputSchema,
  updateUnitResidentInputSchema,
} from "@mysociety/types";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import { buildCsvTemplate } from "../directory/csv-template.js";
import { processCsvImport } from "../directory/csv-import.js";

export interface AdminDirectoryRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin"] as const;

export function registerAdminDirectoryRoutes(app: FastifyInstance, options: AdminDirectoryRouteOptions) {
  const preHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];

  app.get("/admin/residents/import/template", { preHandler }, async (_request, reply) => {
    reply.header("content-type", "text/csv");
    return reply.send(buildCsvTemplate());
  });

  app.post("/admin/residents/import", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "CSV file is required (multipart field 'file')" });
    }
    const buffer = await file.toBuffer();
    const csvContent = buffer.toString("utf-8");

    const dryRunQuery = (request.query as { dryRun?: string }).dryRun;
    const dryRun = dryRunQuery !== "false";

    const report = await options.tenantDb.withTenant(societyId, (tx) =>
      processCsvImport(tx, societyId, csvContent, { dryRun }),
    );
    return reply.send(report);
  });

  app.get("/admin/units", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const units = await options.tenantDb.withTenant(societyId, (tx) => listUnits(tx));
    return reply.send(units);
  });

  app.get("/admin/units/:id", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const { id } = request.params as { id: string };

    const result = await options.tenantDb.withTenant(societyId, async (tx) => {
      const unit = await findUnitById(tx, id);
      if (!unit) return null;
      const residents = await listResidentsByUnitId(tx, id);
      const unitResidents = await listUnitResidentsByUnitId(tx, id);
      const parkingSpots = await listParkingSpotsByUnitId(tx, id);
      return { unit, residents, unitResidents, parkingSpots };
    });

    if (!result) {
      return reply.code(404).send({ error: "Unit not found" });
    }
    return reply.send(result);
  });

  app.post("/admin/units", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const parsed = createUnitInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const unit = await options.tenantDb.withTenant(societyId, (tx) =>
      createUnit(tx, { societyId, ...parsed.data }),
    );
    return reply.code(201).send(unit);
  });

  app.patch("/admin/units/:id", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const { id } = request.params as { id: string };
    const parsed = updateUnitInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const unit = await options.tenantDb.withTenant(societyId, (tx) => updateUnit(tx, id, parsed.data));
    if (!unit) {
      return reply.code(404).send({ error: "Unit not found" });
    }
    return reply.send(unit);
  });

  app.post("/admin/units/:id/residents", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const { id } = request.params as { id: string };
    const parsed = addUnitResidentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }
    const input = parsed.data;

    const result = await options.tenantDb.withTenant(societyId, async (tx) => {
      const unit = await findUnitById(tx, id);
      if (!unit) return null;

      const roleName = input.relationship === "owner" ? "resident_owner" : input.relationship === "tenant" ? "resident_tenant" : "resident_family";
      const role = await findRoleByName(tx, roleName);
      if (!role) throw new Error(`Role ${roleName} not found; auth migration not applied?`);

      let resident = await findResidentByMobile(tx, input.mobile);
      if (!resident) {
        resident = await createResident(tx, {
          societyId,
          roleId: role.id,
          name: input.name,
          mobile: input.mobile,
          isPrimary: input.isPrimary ?? false,
          canPay: input.canPay ?? true,
        });
      }
      if (!resident) throw new Error(`Failed to create resident ${input.mobile}`);

      const existingLink = await findUnitResident(tx, id, resident.id);
      if (existingLink) return existingLink;

      return createUnitResident(tx, {
        societyId,
        unitId: id,
        residentId: resident.id,
        relationship: input.relationship,
        isPrimary: input.isPrimary,
        canPay: input.canPay,
      });
    });

    if (!result) {
      return reply.code(404).send({ error: "Unit not found" });
    }
    return reply.code(201).send(result);
  });

  app.patch("/admin/units/:id/residents/:residentId", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const { residentId } = request.params as { id: string; residentId: string };
    const parsed = updateUnitResidentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }

    const updated = await options.tenantDb.withTenant(societyId, (tx) =>
      updateUnitResident(tx, residentId, parsed.data),
    );
    if (!updated) {
      return reply.code(404).send({ error: "unit_resident link not found" });
    }
    return reply.send(updated);
  });

  app.delete("/admin/units/:id/residents/:residentId", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const { residentId } = request.params as { id: string; residentId: string };
    await options.tenantDb.withTenant(societyId, (tx) => deleteUnitResident(tx, residentId));
    return reply.code(204).send();
  });

  app.get("/admin/staff", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const staff = await options.tenantDb.withTenant(societyId, (tx) =>
      listAdminUsers(tx, { societyId, rolePrefix: "facility_manager" }),
    );
    return reply.send(staff);
  });

  app.get("/admin/parking-spots", { preHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) {
      return reply.code(400).send({ error: "Admin account is not scoped to a society" });
    }
    const spots = await options.tenantDb.withTenant(societyId, (tx) => listParkingSpots(tx));
    return reply.send(spots);
  });
}
