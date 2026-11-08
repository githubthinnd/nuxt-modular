<script setup lang="ts">
const registry = useModuleRegistry()
const { granted } = useModularPermissions()
const role = useCookie<string>('demo-role', { default: () => 'student' })

const activeCount = computed(() => registry.extensions.value.filter((extension) => extension.active).length)

function statusOf(extension: { active: boolean; missingDependencies: readonly string[] }) {
  if (extension.active) return { label: 'active', tone: 'success' }
  if (extension.missingDependencies.length) return { label: 'inactive', tone: 'warning' }
  return { label: 'inactive', tone: '' }
}

useHead({ title: 'Dashboard' })
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <span class="eyebrow"><AppIcon name="dashboard" :size="14" />Overview</span>
        <h1>Dashboard</h1>
        <p>Host-owned page. Every card after “Courses” is contributed by an extension through the <code>dashboard.metrics</code> outlet.</p>
      </div>
    </header>

    <section class="stats" aria-label="Metrics">
      <article class="card stat">
        <div class="stat-top">
          <span class="stat-label">Courses</span>
          <span class="icon-chip"><AppIcon name="book" /></span>
        </div>
        <span class="stat-value">1</span>
        <span class="stat-foot">Owned by the host</span>
      </article>
      <PluginOutlet name="dashboard.metrics">
        <template #fallback="{ extensionId }">
          <article class="card stat stat-error" role="alert">
            <div class="stat-top">
              <span class="stat-label">Widget unavailable</span>
              <span class="icon-chip danger"><AppIcon name="alert" /></span>
            </div>
            <p>The <code>{{ extensionId }}</code> widget crashed. The rest of the page is unaffected.</p>
          </article>
        </template>
      </PluginOutlet>
    </section>

    <section class="card">
      <div class="card-header">
        <div class="card-header-title">
          <span class="icon-chip"><AppIcon name="extensions" /></span>
          <div>
            <h2>Extensions</h2>
            <p>{{ activeCount }} of {{ registry.extensions.value.length }} active. The switch is a session override for this tab only.</p>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Extension</th><th>Version</th><th>Status</th><th>Persisted</th><th class="cell-end">This session</th></tr>
          </thead>
          <tbody>
            <tr v-for="extension in registry.extensions.value" :key="extension.id" :data-extension-row="extension.id">
              <td>
                <span class="cell-name">
                  <strong>{{ extension.manifest.name }}</strong>
                  <span class="muted">{{ extension.id }}</span>
                </span>
              </td>
              <td><span class="badge plain">v{{ extension.manifest.version }}</span></td>
              <td><span class="badge status-badge" :class="statusOf(extension).tone">{{ statusOf(extension).label }}</span></td>
              <td>
                <span v-if="extension.persistedOverride === null" class="muted">—</span>
                <span v-else class="badge" :class="extension.persistedOverride ? 'success' : 'danger'">{{ extension.persistedOverride ? 'on' : 'off' }}</span>
              </td>
              <td class="cell-end">
                <input
                  type="checkbox"
                  class="switch"
                  :checked="extension.active"
                  :aria-label="`Toggle ${extension.id}`"
                  @change="registry.setModuleActive(extension.id, ($event.target as HTMLInputElement).checked)"
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card-foot">
        Granted capabilities: <code>{{ granted.join(', ') || 'none' }}</code>
        · Build-time removal: <code>NUXT_MODULAR_DISABLED=&lt;id&gt;</code>
      </div>
    </section>

    <AdminToggles v-if="role === 'admin'" />
  </div>
</template>

<style scoped>
.status-badge { text-transform: capitalize; }
</style>
