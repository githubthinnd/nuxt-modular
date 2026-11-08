<script setup lang="ts">
import { DEMO_ROLES } from '~/utils/roles'

const registry = useModuleRegistry()
const navigation = computed(() => registry.getNavigation('sidebar'))
const role = useCookie<string>('demo-role', { default: () => 'student', sameSite: 'lax' })
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
      <PluginOutlet name="dashboard.header" wrap-with="div" class="header-outlet" />
      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>
