import { HOST_CAPABILITIES, isDemoRole } from '~/utils/roles'

/**
 * Host-side permission adapter. A real host would read the session here;
 * the demo reads a cookie so the server and the client agree on the role.
 * Extension capabilities follow the manifests' `defaultRoles`.
 */
export default defineNuxtPlugin(() => {
  const role = useCookie<string>('demo-role', { default: () => 'student', sameSite: 'lax' })
  const permissions = useModularPermissions()

  watch(
    role,
    (current) => {
      const safeRole = isDemoRole(current) ? current : 'guest'
      permissions.setRoles([safeRole], HOST_CAPABILITIES[safeRole])
    },
    { immediate: true },
  )
})
