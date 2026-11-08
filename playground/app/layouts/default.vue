<script setup lang="ts">
import { DEMO_ROLES } from '~/utils/roles'

const registry = useModuleRegistry()
const navigation = computed(() => registry.getNavigation('sidebar'))
const role = useCookie<string>('demo-role', { default: () => 'student', sameSite: 'lax' })

// Theme: follows the OS until the user picks one; stored in a cookie so SSR renders the right theme.
const theme = useCookie<'light' | 'dark' | ''>('demo-theme', { default: () => '', sameSite: 'lax' })
useHead({ htmlAttrs: { 'data-theme': () => theme.value || undefined } })
function toggleTheme() {
  const dark = theme.value ? theme.value === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  theme.value = dark ? 'light' : 'dark'
}
const themeIcon = computed(() => (theme.value === 'dark' ? 'sun' : theme.value === 'light' ? 'moon' : 'sun'))

// Breadcrumbs from the route.
const route = useRoute()
const crumbs = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  const label = (part: string) => part.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  if (!parts.length) return [{ label: 'Dashboard', to: '' }]
  return parts.map((part, index) => ({ label: label(part), to: index === parts.length - 1 ? '' : `/${parts.slice(0, index + 1).join('/')}` }))
})

// Outlet X-ray: frames and labels everything an extension contributes to the page.
const xray = ref(false)
function paintXray() {
  for (const element of document.querySelectorAll('[data-xray]')) element.removeAttribute('data-xray')
  if (!xray.value) return
  for (const item of document.querySelectorAll('[data-extension]')) {
    const target = item.firstElementChild
    const id = item.getAttribute('data-extension')
    if (target && id) target.setAttribute('data-xray', id)
  }
}
watch([xray, () => route.fullPath], () => nextTick(() => setTimeout(paintXray, 50)))
onMounted(() => {
  const onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (event.key.toLowerCase() !== 'x' || event.metaKey || event.ctrlKey || /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return
    xray.value = !xray.value
  }
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar" aria-label="Main navigation">
      <NuxtLink to="/" class="brand">
        <span class="brand-mark"><AppIcon name="logo" :size="17" /></span>
        <span>Host Platform<small>nuxt-modular demo</small></span>
      </NuxtLink>

      <nav class="nav-section" aria-labelledby="nav-workspace">
        <p id="nav-workspace" class="nav-caption">Workspace</p>
        <ul class="nav-tree">
          <li>
            <NuxtLink to="/" class="nav-link"><AppIcon name="dashboard" />Dashboard</NuxtLink>
          </li>
          <li>
            <NuxtLink to="/course/nuxt-basics" class="nav-link"><AppIcon name="book" />Nuxt basics</NuxtLink>
          </li>
        </ul>
      </nav>

      <nav class="nav-section" aria-labelledby="nav-extensions">
        <p id="nav-extensions" class="nav-caption">Extensions</p>
        <NavTree v-if="navigation.length" :items="navigation" />
        <p v-else class="nav-empty">No extension menu items for this role.</p>
      </nav>

      <div class="sidebar-footer">
        <div class="role-switcher">
          <span class="avatar" aria-hidden="true">{{ role.slice(0, 2) }}</span>
          <label>
            Viewing as
            <select v-model="role" data-testid="role-select">
              <option v-for="option in DEMO_ROLES" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <nav class="crumbs" aria-label="Breadcrumb">
          <NuxtLink to="/">Host Platform</NuxtLink>
          <template v-for="crumb in crumbs" :key="crumb.label">
            <span class="sep" aria-hidden="true">/</span>
            <NuxtLink v-if="crumb.to" :to="crumb.to">{{ crumb.label }}</NuxtLink>
            <strong v-else>{{ crumb.label }}</strong>
          </template>
        </nav>
        <div class="topbar-actions">
          <button type="button" class="tool-btn" data-testid="xray-toggle" :aria-pressed="xray" title="Highlight what extensions contribute" @click="xray = !xray">
            <AppIcon name="scan" :size="15" /><span class="label">Show extensions</span><kbd>X</kbd>
          </button>
          <ClientOnly>
            <button type="button" class="tool-btn icon-only" data-testid="theme-toggle" aria-label="Toggle theme" @click="toggleTheme">
              <AppIcon :name="themeIcon" :size="15" />
            </button>
          </ClientOnly>
        </div>
      </header>
      <PluginOutlet name="dashboard.header" wrap-with="div" class="header-outlet" />
      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>
