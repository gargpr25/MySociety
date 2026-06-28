export { createDb, createPool, type Database } from "./client.js";

export { withTenantContext } from "./tenant-context.js";
export { runMigrations } from "./migrate.js";
export * as schema from "./schema.js";
export { createSociety, findSocietyByName } from "./repositories/societies.js";
export { createTower, findTowerByName, listTowers } from "./repositories/towers.js";
export {
  bulkFindOrCreateUnits,
  createUnit,
  findUnitByFlatNo,
  findUnitById,
  listUnits,
  updateUnit,
} from "./repositories/units.js";
export { findRoleByName, findRoleById } from "./repositories/roles.js";
export {
  bulkFindOrCreateResidents,
  createResident,
  findResidentByMobile,
  findResidentById,
  findResidentsByMobileAcrossTenants,
  listResidentsByUnitId,
} from "./repositories/residents.js";
export {
  createAdminUser,
  findAdminByEmail,
  findAdminById,
  findAdminByEmailAcrossTenants,
  listAdminUsers,
} from "./repositories/admin-users.js";
export {
  countRecentOtpRequests,
  createOtpRequest,
  findLatestOtpRequest,
  incrementOtpAttempts,
  markOtpConsumed,
} from "./repositories/otp-requests.js";
export {
  bulkCreateUnitResidents,
  createUnitResident,
  deleteUnitResident,
  findUnitResident,
  listUnitResidentsByUnitId,
  updateUnitResident,
  type Relationship,
} from "./repositories/unit-residents.js";
export {
  bulkFindOrCreateParkingSpots,
  createParkingSpot,
  findParkingSpotByNo,
  listParkingSpots,
  listParkingSpotsByUnitId,
} from "./repositories/parking-spots.js";
export {
  bulkInsertBillLineItems,
  bulkInsertBills,
  bulkUpsertMeterReadings,
  createBillHead,
  createBillingCycle,
  deleteBillHead,
  deleteBillsByCycleId,
  findBillById,
  findBillByUnitAndCycle,
  findBillHeadById,
  findBillingCycleById,
  findBillingCycleByPeriod,
  findPreviousBillingCycle,
  getCollectionSummary,
  listActiveBillHeads,
  listBillHeads,
  listBillsByCycleId,
  listBillsByUnitId,
  listBillingCycles,
  listLineItemsByBillId,
  listMeterReadingsForPeriod,
  markOverdueBills,
  updateBillHead,
  updateBillingCycleStatus,
  updateBillStatusAndPaid,
  upsertMeterReading,
} from "./repositories/billing.js";
export {
  createNotice,
  deleteNotice,
  findNoticeById,
  listActiveNotices,
  listAllNotices,
  updateNotice,
  type NoticeAudience,
} from "./repositories/notices.js";
export {
  applyPaymentToBill,
  createBankAccount,
  createPayment,
  createPaymentAllocations,
  findBankAccountById,
  findPaymentById,
  findPaymentByProviderOrderId,
  insertAuditLog,
  listAllocationsByBillId,
  listAllocationsByPaymentId,
  listAuditLog,
  listBankAccounts,
  listPaymentsByResident,
  listPaymentsBySociety,
  listPendingPaymentsOlderThan,
  markGatewayEventProcessed,
  sumAllocationsForBills,
  updateBankAccountStatus,
  updatePaymentCaptured,
  updatePaymentFailed,
  upsertGatewayEvent,
  type AuditLogRow,
  type BankAccountRow,
  type GatewayEventRow,
  type PaymentAllocationRow,
  type PaymentRow,
} from "./repositories/payments.js";
export {
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
  type CreateBookingInput,
  type CreateParkingAllocationInput,
  type CreateResourceInput,
} from "./repositories/bookings.js";
export {
  addTicketComment,
  assignTicket,
  createTicket,
  findTicketById,
  listOverdueOpenTickets,
  listTicketEvents,
  listTicketsByResident,
  listTicketsBySociety,
  markTicketsSlaBreached,
  updateTicketStatus,
  type CreateTicketInput,
  type ListTicketsFilter,
} from "./repositories/tickets.js";
export {
  createIntegrationConfig,
  findActiveConfigsForEvent,
  findIntegrationConfigById,
  listIntegrationConfigs,
  updateIntegrationConfig,
  type CreateIntegrationConfigInput,
} from "./repositories/integrations.js";
export {
  createChatSession,
  findActiveChatSession,
  listChatMessages,
  saveChatMessage,
} from "./repositories/chat.js";
export {
  createDispatchLog,
  listDispatchLogsByIntegration,
  listDispatchLogsBySociety,
} from "./repositories/dispatch-logs.js";
