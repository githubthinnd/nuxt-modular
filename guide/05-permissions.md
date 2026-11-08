# 5. Permissions

nuxt-modular does not authenticate anyone. It gives you a small **capability** system so that extension UI, navigation
and pages can follow *your* authorization decisions identically on server and client.

## Capabilities

A capability is a dot-namespaced string: `quiz.view`, `quiz.manage`, `analytics.view`. Extensions declare the ones they
introduce:

```ts
permissions: [
  { id: 'quiz.view',   label: 'Take quizzes',   defaultRoles: ['student', 'teacher'] },
  { id: 'quiz.manage', label: 'Manage quizzes', defaultRoles: ['teacher'] },
]
```

## Requirements

Anywhere a manifest accepts `permission` (slots, navigation) you may write:

```ts
permission: 'quiz.view'                                   // that capability
permission: { anyOf: ['quiz.manage', 'admin'] }           // at least one
permission: { allOf: ['quiz.view', 'quiz.edit'] }         // all of them
```

No `permission` means everyone may see it.

## Granting capabilities to the viewer

Do this once per request, in a Nuxt plugin or route middleware that knows the current user:

```ts
// app/plugins/permissions.ts
export default defineNuxtPlugin(() => {
  const permissions = useModularPermissions()
  const session = useUserSession()   // your own auth

  // Map roles to capabilities using the manifests' `defaultRoles`, plus host capabilities:
  permissions.setRoles(session.roles, ['course.view'])

  // …or set capabilities explicitly. '*' grants everything:
  // permissions.set(['quiz.view', 'course.view'])
})
```

| Method | Effect |
|--------|--------|
| `set(capabilities)` | Replace the granted set. `'*'` grants all. |
| `setRoles(roles, extra?)` | Capabilities from `defaultRoles` of all registered extensions, plus `extra`. Replaces the set. |
| `grant(...caps)` / `revoke(...caps)` | Add or remove. |
| `can(requirement?)` | Check a requirement; an absent one passes. |
| `granted` | Reactive, sorted list. |

`useModuleRegistry().capabilitiesForRoles(['teacher'])` returns the derived list without applying it.

State is kept with `useState`, so the server render and the hydrated client evaluate permissions identically.

## Important: UI gating is not security

Hiding a slot or a menu entry does **not** protect data. Always enforce authorization in your API routes too:

```ts
// extensions/quiz/server/api/quiz/manage.post.ts
export default defineEventHandler(async (event) => {
  await requireCapability(event, 'quiz.manage')   // your own server-side check
  // …
})
```

nuxt-modular's guard answers `404` for routes of *switched-off* extensions; it never decides whether a particular user
may call an enabled route.
