export const DEMO_ROLES = ['guest', 'student', 'teacher', 'admin'] as const
export type DemoRole = (typeof DEMO_ROLES)[number]

/**
 * Capabilities owned by the host itself. Extension capabilities are not
 * listed here: they come from each manifest's `permissions[].defaultRoles`
 * through `useModularPermissions().setRoles()`. `*` grants everything.
 */
export const HOST_CAPABILITIES: Readonly<Record<DemoRole, readonly string[]>> = {
  guest: [],
  student: ['course.view'],
  teacher: ['course.view'],
  admin: ['*'],
}

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === 'string' && (DEMO_ROLES as readonly string[]).includes(value)
}
