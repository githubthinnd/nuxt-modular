/*
 * Files written by `nuxt-modular init`. Plain, readable code the user is
 * expected to edit: no markers, no generated-by banners.
 */

export function hostShellStub(appName: string): string {
  return `<script setup lang="ts">
const registry = useModuleRegistry()
const navigation = computed(() => registry.getNavigation('sidebar'))
</script>

<template>
  <div class="shell">
    <NuxtRouteAnnouncer />
    <header class="shell-header">
      <NuxtLink to="/" class="shell-brand">${appName.replace(/[<>&'"`$\\{}]/g, '')}</NuxtLink>
      <nav class="shell-nav" aria-label="Main navigation">
        <template v-for="item in navigation" :key="item.id">
          <NuxtLink v-if="item.path" :to="item.path" class="shell-link">{{ item.label }}</NuxtLink>
        </template>
      </nav>
    </header>
    <main class="shell-main">
      <NuxtPage />
    </main>
  </div>
</template>

<style>
:root {
  color-scheme: light dark;
  --surface: #ffffff;
  --text: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --accent: #4f46e5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #18181b;
    --text: #fafafa;
    --muted: #a1a1aa;
    --border: #3f3f46;
    --accent: #818cf8;
  }
}
body {
  margin: 0;
  background: var(--surface);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.shell-header {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0.875rem 1.5rem;
  border-bottom: 1px solid var(--border);
}
.shell-brand {
  font-weight: 600;
  color: inherit;
  text-decoration: none;
}
.shell-nav {
  display: flex;
  gap: 1rem;
}
.shell-link {
  color: var(--muted);
  text-decoration: none;
}
.shell-link:hover,
.shell-link.router-link-active {
  color: var(--accent);
}
.shell-main {
  max-width: 64rem;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
</style>
`
}

export const homePageStub = (): string => `<script setup lang="ts">
useHead({ title: 'Home' })
</script>

<template>
  <section>
    <h1>Welcome</h1>
    <p>This page is the host. Extensions contribute content to its outlets.</p>
    <PluginOutlet name="dashboard.widgets" />
  </section>
</template>
`

export function permissionsPluginStub(roles: readonly string[], defaultRole: string): string {
  return `// Tells nuxt-modular who the current visitor is. Extension content is hidden until
// the viewer holds the capability it requires; roles map to capabilities through
// each extension's \`defaultRoles\`. Replace the cookie with your session or auth data.
//
// Roles in this app: ${roles.join(', ')}
export default defineNuxtPlugin(() => {
  const role = useCookie<string>('role', { default: () => '${defaultRole}' })
  useModularPermissions().setRoles([role.value])
})
`
}
