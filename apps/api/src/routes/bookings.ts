import type { FastifyInstance } from "fastify";
import {
  cancelBooking,
  createBooking,
  createParkingAllocation,
  createResource,
  endParkingAllocation,
  findActiveAllocationBySpot,
  findBookingById,
  findResourceById,
  listAllResources,
  listBookingsByResident,
  listBookingsBySociety,
  listParkingAllocations,
  listResources,
  updateResource,
} from "@mysociety/db";
import {
  createBookingSchema,
  createParkingAllocationSchema,
  createResourceSchema,
  updateResourceSchema,
} from "@mysociety/types";
import type { TenantAwareDb } from "../db.js";
import { authenticate, requireRole } from "../auth/middleware.js";

export interface BookingRouteOptions {
  tenantDb: TenantAwareDb;
  jwtSecret: string;
}

const ADMIN_ROLES = ["society_admin", "platform_super_admin", "society_accountant", "facility_manager"] as const;
const RESIDENT_ROLES = ["resident_owner", "resident_tenant", "resident_family"] as const;

export function registerBookingRoutes(app: FastifyInstance, options: BookingRouteOptions) {
  const { tenantDb } = options;
  const residentPreHandler = [authenticate(options.jwtSecret), requireRole(...RESIDENT_ROLES)];
  const adminPreHandler = [authenticate(options.jwtSecret), requireRole(...ADMIN_ROLES)];

  // ── Public resource listing ────────────────────────────────────────────────

  app.get("/resident/resources", { preHandler: residentPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });
    const list = await tenantDb.withTenant(societyId, (db) => listResources(db));
    return reply.send(list.map(serializeResource));
  });

  // ── Resident: create booking ────────────────────────────────────────────────

  app.post("/resident/bookings", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });

    const parsed = createBookingSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const { resourceId, unitId, slotStart, slotEnd } = parsed.data;
    const result = await tenantDb.withTenant(societyId, (db) =>
      createBooking(db, {
        societyId,
        resourceId,
        unitId,
        bookedBy: principal.id,
        slotStart: new Date(slotStart),
        slotEnd: new Date(slotEnd),
      }),
    );

    if (result.conflict) return reply.code(409).send({ error: result.reason });
    return reply.code(201).send(serializeBooking(result.booking));
  });

  // ── Resident: list my bookings ──────────────────────────────────────────────

  app.get("/resident/bookings", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });
    const list = await tenantDb.withTenant(societyId, (db) =>
      listBookingsByResident(db, principal.id),
    );
    return reply.send(list.map(serializeBooking));
  });

  // ── Resident: cancel booking ────────────────────────────────────────────────

  app.post("/resident/bookings/:id/cancel", { preHandler: residentPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Resident not scoped to a society" });
    const { id } = request.params as { id: string };

    const booking = await tenantDb.withTenant(societyId, (db) => findBookingById(db, id));
    if (!booking) return reply.code(404).send({ error: "Not found" });
    if (booking.bookedBy !== principal.id) return reply.code(403).send({ error: "Forbidden" });
    if (booking.status === "cancelled") return reply.code(400).send({ error: "Already cancelled" });

    const updated = await tenantDb.withTenant(societyId, (db) => cancelBooking(db, id));
    return reply.send(serializeBooking(updated!));
  });

  // ── Admin: manage resources ─────────────────────────────────────────────────

  app.post("/admin/resources", { preHandler: adminPreHandler }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) return reply.code(401).send({ error: "Unauthorized" });
    const societyId = principal.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });

    const parsed = createResourceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const resource = await tenantDb.withTenant(societyId, (db) =>
      createResource(db, { societyId, ...parsed.data }),
    );
    return reply.code(201).send(serializeResource(resource));
  });

  app.get("/admin/resources", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });
    const list = await tenantDb.withTenant(societyId, (db) => listAllResources(db));
    return reply.send(list.map(serializeResource));
  });

  app.patch("/admin/resources/:id", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });

    const { id } = request.params as { id: string };
    const parsed = updateResourceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const existing = await tenantDb.withTenant(societyId, (db) => findResourceById(db, id));
    if (!existing) return reply.code(404).send({ error: "Not found" });

    const updated = await tenantDb.withTenant(societyId, (db) => updateResource(db, id, parsed.data));
    return reply.send(serializeResource(updated!));
  });

  // ── Admin: view all bookings ────────────────────────────────────────────────

  app.get("/admin/bookings", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });

    const query = request.query as { resourceId?: string; status?: string };
    const list = await tenantDb.withTenant(societyId, (db) =>
      listBookingsBySociety(db, { resourceId: query.resourceId, status: query.status }),
    );
    return reply.send(list.map(serializeBooking));
  });

  // ── Admin: cancel any booking ───────────────────────────────────────────────

  app.post("/admin/bookings/:id/cancel", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });

    const { id } = request.params as { id: string };
    const booking = await tenantDb.withTenant(societyId, (db) => findBookingById(db, id));
    if (!booking) return reply.code(404).send({ error: "Not found" });
    if (booking.status === "cancelled") return reply.code(400).send({ error: "Already cancelled" });

    const updated = await tenantDb.withTenant(societyId, (db) => cancelBooking(db, id));
    return reply.send(serializeBooking(updated!));
  });

  // ── Admin: parking allocations ──────────────────────────────────────────────

  app.post("/admin/parking-allocations", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });

    const parsed = createParkingAllocationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const existing = await tenantDb.withTenant(societyId, (db) =>
      findActiveAllocationBySpot(db, parsed.data.spotId),
    );
    if (existing) return reply.code(409).send({ error: "Spot already has an active allocation" });

    const { allocation, billId } = await tenantDb.withTenant(societyId, (db) =>
      createParkingAllocation(db, { societyId, ...parsed.data, startsAt: new Date(parsed.data.startsAt), endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined }),
    );
    return reply.code(201).send({ ...serializeAllocation(allocation), billId: billId ?? null });
  });

  app.get("/admin/parking-allocations", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });
    const list = await tenantDb.withTenant(societyId, (db) => listParkingAllocations(db));
    return reply.send(list.map(serializeAllocation));
  });

  app.post("/admin/parking-allocations/:id/end", { preHandler: adminPreHandler }, async (request, reply) => {
    const societyId = request.principal?.societyId;
    if (!societyId) return reply.code(400).send({ error: "Admin not scoped to a society" });

    const { id } = request.params as { id: string };
    const updated = await tenantDb.withTenant(societyId, (db) => endParkingAllocation(db, id));
    if (!updated) return reply.code(404).send({ error: "Active allocation not found" });
    return reply.send(serializeAllocation(updated));
  });
}

function serializeResource(r: {
  id: string;
  societyId: string;
  name: string;
  description: string;
  capacity: number;
  slotRules: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    societyId: r.societyId,
    name: r.name,
    description: r.description,
    capacity: r.capacity,
    slotRules: r.slotRules,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function serializeBooking(b: {
  id: string;
  societyId: string;
  resourceId: string;
  unitId: string;
  bookedBy: string;
  slotStart: Date;
  slotEnd: Date;
  status: string;
  createdAt: Date;
}) {
  return {
    id: b.id,
    societyId: b.societyId,
    resourceId: b.resourceId,
    unitId: b.unitId,
    bookedBy: b.bookedBy,
    slotStart: b.slotStart.toISOString(),
    slotEnd: b.slotEnd.toISOString(),
    status: b.status,
    createdAt: b.createdAt.toISOString(),
  };
}

function serializeAllocation(a: {
  id: string;
  societyId: string;
  spotId: string;
  unitId: string;
  period: string;
  rentAmount: number;
  billId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: a.id,
    societyId: a.societyId,
    spotId: a.spotId,
    unitId: a.unitId,
    period: a.period,
    rentAmount: a.rentAmount,
    billId: a.billId,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt?.toISOString() ?? null,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  };
}
