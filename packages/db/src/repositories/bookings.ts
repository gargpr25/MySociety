import { and, eq, gt, lt, sql } from "drizzle-orm";
import { bookableResources, bookings, billHeads, billLineItems, bills, parkingAllocations } from "../schema.js";
import type { Database } from "../index.js";

// ── Bookable Resources ──────────────────────────────────────────────────────

export interface CreateResourceInput {
  societyId: string;
  name: string;
  description?: string;
  capacity?: number;
  slotRules?: object;
}

export async function createResource(db: Database, input: CreateResourceInput) {
  const [row] = await db
    .insert(bookableResources)
    .values({
      societyId: input.societyId,
      name: input.name,
      description: input.description ?? "",
      capacity: input.capacity ?? 1,
      slotRules: input.slotRules ?? {},
    })
    .returning();
  return row!;
}

export async function listResources(db: Database) {
  return db
    .select()
    .from(bookableResources)
    .where(eq(bookableResources.isActive, true))
    .orderBy(bookableResources.name);
}

export async function listAllResources(db: Database) {
  return db.select().from(bookableResources).orderBy(bookableResources.name);
}

export async function findResourceById(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(bookableResources)
    .where(eq(bookableResources.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateResource(
  db: Database,
  id: string,
  input: Partial<{ name: string; description: string; capacity: number; slotRules: object; isActive: boolean }>,
) {
  const [row] = await db
    .update(bookableResources)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(bookableResources.id, id))
    .returning();
  return row ?? null;
}

// ── Bookings ────────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  societyId: string;
  resourceId: string;
  unitId: string;
  bookedBy: string;
  slotStart: Date;
  slotEnd: Date;
}

export type BookingConflictError = { conflict: true; reason: string };
export type BookingSuccess = { conflict: false; booking: typeof bookings.$inferSelect };

export async function createBooking(
  db: Database,
  input: CreateBookingInput,
): Promise<BookingSuccess | BookingConflictError> {
  const resource = await findResourceById(db, input.resourceId);
  if (!resource) return { conflict: true, reason: "resource_not_found" };
  if (!resource.isActive) return { conflict: true, reason: "resource_not_active" };

  if (input.slotStart >= input.slotEnd) {
    return { conflict: true, reason: "slot_start_must_be_before_slot_end" };
  }

  // Count confirmed bookings that overlap the requested slot
  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.resourceId, input.resourceId),
        eq(bookings.status, "confirmed"),
        lt(bookings.slotStart, input.slotEnd),
        gt(bookings.slotEnd, input.slotStart),
      ),
    );

  const currentCount = countRow?.count ?? 0;
  if (currentCount >= resource.capacity) {
    return { conflict: true, reason: "resource_fully_booked_for_slot" };
  }

  const [booking] = await db
    .insert(bookings)
    .values({
      societyId: input.societyId,
      resourceId: input.resourceId,
      unitId: input.unitId,
      bookedBy: input.bookedBy,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
    })
    .returning();

  return { conflict: false, booking: booking! };
}

export async function findBookingById(db: Database, id: string) {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return row ?? null;
}

export async function cancelBooking(db: Database, id: string) {
  const [row] = await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(and(eq(bookings.id, id), eq(bookings.status, "confirmed")))
    .returning();
  return row ?? null;
}

export async function listBookingsByResident(db: Database, residentId: string) {
  return db
    .select()
    .from(bookings)
    .where(eq(bookings.bookedBy, residentId))
    .orderBy(bookings.slotStart);
}

export async function listBookingsBySociety(
  db: Database,
  filter: { resourceId?: string; status?: string } = {},
) {
  const conditions = [];
  if (filter.resourceId) conditions.push(eq(bookings.resourceId, filter.resourceId));
  if (filter.status) conditions.push(eq(bookings.status, filter.status));

  return db
    .select()
    .from(bookings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(bookings.slotStart);
}

// ── Parking Allocations ─────────────────────────────────────────────────────

export interface CreateParkingAllocationInput {
  societyId: string;
  spotId: string;
  unitId: string;
  period: string;
  rentAmount: number;
  startsAt: Date;
  endsAt?: Date;
  cycleId?: string;
  dueDate?: string;
}

export async function createParkingAllocation(db: Database, input: CreateParkingAllocationInput) {
  let billId: string | undefined;

  if (input.rentAmount > 0 && input.cycleId) {
    const parkingHead = await findOrCreateParkingHead(db, input.societyId);
    const [bill] = await db
      .insert(bills)
      .values({
        societyId: input.societyId,
        unitId: input.unitId,
        cycleId: input.cycleId,
        dueDate: input.dueDate ?? new Date().toISOString().slice(0, 10),
        status: "unpaid",
        subtotal: input.rentAmount,
        taxTotal: 0,
        arrearsCarryForward: 0,
        totalDue: input.rentAmount,
        paidAmount: 0,
      })
      .returning();

    if (bill) {
      await db.insert(billLineItems).values({
        societyId: input.societyId,
        billId: bill.id,
        headId: parkingHead.id,
        description: `Parking rental — ${input.period}`,
        qty: 1,
        rate: input.rentAmount,
        amount: input.rentAmount,
        taxAmount: 0,
      });
      billId = bill.id;
    }
  }

  const [allocation] = await db
    .insert(parkingAllocations)
    .values({
      societyId: input.societyId,
      spotId: input.spotId,
      unitId: input.unitId,
      period: input.period,
      rentAmount: input.rentAmount,
      billId: billId ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
    })
    .returning();

  return { allocation: allocation!, billId };
}

async function findOrCreateParkingHead(db: Database, societyId: string) {
  const existing = await db
    .select()
    .from(billHeads)
    .where(and(eq(billHeads.societyId, societyId), eq(billHeads.name, "Parking Rental")))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(billHeads)
    .values({
      societyId,
      name: "Parking Rental",
      computeRule: "fixed",
      rate: 0,
      taxRule: { type: "none" },
      isActive: true,
    })
    .returning();
  return created!;
}

export async function endParkingAllocation(db: Database, id: string) {
  const [row] = await db
    .update(parkingAllocations)
    .set({ status: "ended", endsAt: new Date(), updatedAt: new Date() })
    .where(and(eq(parkingAllocations.id, id), eq(parkingAllocations.status, "active")))
    .returning();
  return row ?? null;
}

export async function listParkingAllocations(db: Database) {
  return db
    .select()
    .from(parkingAllocations)
    .where(eq(parkingAllocations.status, "active"))
    .orderBy(parkingAllocations.createdAt);
}

export async function findActiveAllocationBySpot(db: Database, spotId: string) {
  const [row] = await db
    .select()
    .from(parkingAllocations)
    .where(and(eq(parkingAllocations.spotId, spotId), eq(parkingAllocations.status, "active")))
    .limit(1);
  return row ?? null;
}
