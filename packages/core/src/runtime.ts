/*
 * Zod-free entry point for code that ships to the browser.
 * Everything here works on already-validated manifests, so importing it does
 * not pull the validation schemas (and zod) into the client bundle.
 */

export type {
  ExtensionManifest,
  NavigationItem,
  OutletSlotDefinition,
  PermissionDeclaration,
  PermissionRequirement,
  ServerHookSubscription,
  ServerHookType,
} from './manifest'
export type { JsonValue } from './json'

export { allowAll, createPermissionChecker, hasPermission, WILDCARD_PERMISSION } from './permissions'
export type { PermissionChecker } from './permissions'

export { compareOrdered } from './ordering'
export type { Ordered } from './ordering'

export {
  capabilitiesForRoles,
  componentKey,
  createRegistryState,
  ExtensionConflictError,
  findMissingDependencies,
  isExtensionActive,
  listActiveExtensions,
  listOutlets,
  registerExtension,
  resolveNavigation,
  resolveSlots,
  slotKey,
  unregisterExtension,
} from './registry'
export type {
  ConflictStrategy,
  NavigationNode,
  RegisterOptions,
  RegisterOutcome,
  RegistryEntry,
  RegistryState,
  ResolvedSlot,
} from './registry'

export { createHookBus, defineActionHandler, defineFilterHandler } from './hooks'
export type {
  ActionArgs,
  ActionHandler,
  FilterArgs,
  FilterHandler,
  FilterRest,
  FilterValue,
  HookBus,
  HookBusOptions,
  HookErrorInfo,
  HookRegistration,
  HookSubscribeOptions,
  HookType,
  ModularActions,
  ModularFilters,
} from './hooks'

export {
  createMemoryLedger,
  defineMigration,
  migrationStatus,
  runMigrationsDown,
  runMigrationsReset,
  runMigrationsUp,
  sortByDependencies,
} from './migrations'
export type {
  ExtensionMigrationStatus,
  Migration,
  MigrationContext,
  MigrationContextBase,
  MigrationEntry,
  MigrationFailure,
  MigrationLedger,
  MigrationRef,
  MigrationReport,
  ModularMigrationContext,
} from './migrations'

export { checkRequirements, findDependencyCycles } from './requirements'
export type {
  CheckRequirementsOptions,
  RequirementIssue,
  RequirementIssueCode,
  RequirementSubject,
} from './requirements'

export { compareVersions, isValidRange, parseVersion, satisfies } from './semver'
export type { ParsedVersion } from './semver'

export { getConfigValue, mergeConfig } from './config'
export type { JsonObject } from './config'

export { defineSeeder, planSeeders, runSeeders } from './seeders'
export type {
  ModularSeederContext,
  RunSeedersOptions,
  Seeder,
  SeederContext,
  SeederContextBase,
  SeederEntry,
  SeederRef,
  SeederReport,
} from './seeders'

export { createSqlStores, normalizeDialect } from './sql'
export type { ReleaseLock, SqlDatabase, SqlDialect, SqlParam, SqlStatement, SqlStoreOptions, SqlStores } from './sql'
