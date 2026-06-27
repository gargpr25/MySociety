export { createDb, createPool, type Database } from "./client.js";
export { withTenantContext } from "./tenant-context.js";
export { runMigrations } from "./migrate.js";
export * as schema from "./schema.js";
export { createSociety, findSocietyByName } from "./repositories/societies.js";
export { createTower, findTowerByName, listTowers } from "./repositories/towers.js";
export { createUnit, findUnitByFlatNo, listUnits } from "./repositories/units.js";
export { findRoleByName, findRoleById } from "./repositories/roles.js";
export {
  createResident,
  findResidentByMobile,
  findResidentById,
  findResidentsByMobileAcrossTenants,
} from "./repositories/residents.js";
export {
  createAdminUser,
  findAdminByEmail,
  findAdminById,
  findAdminByEmailAcrossTenants,
} from "./repositories/admin-users.js";
export {
  countRecentOtpRequests,
  createOtpRequest,
  findLatestOtpRequest,
  incrementOtpAttempts,
  markOtpConsumed,
} from "./repositories/otp-requests.js";
