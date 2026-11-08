<script setup lang="ts">
const { data, error, refresh } = await useFetch('/api/admin/extensions', { key: 'admin-extensions' })
const busy = ref<string | null>(null)

async function persist(id: string, active: boolean | null) {
  busy.value = id
  try {
    await $fetch<unknown>(`/api/admin/extensions/${encodeURIComponent(id)}`, { method: 'PUT', body: { active } })
    await refresh()
    // Server-rendered state (slots, navigation, pages, routes, hooks) follows the new toggle.
    reloadNuxtApp({ force: true })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="card" data-testid="admin-toggles">
    <div class="card-header">
      <div class="card-header-title">
        <span class="icon-chip"><AppIcon name="sliders" /></span>
        <div>
          <h2>Persistent toggles</h2>
          <p>Stored on the server and applied to every visitor: UI, pages, API routes and hooks.</p>
        </div>
      </div>
      <span class="badge plain"><AppIcon name="lock" :size="13" />Admin only</span>
    </div>

    <p v-if="error" class="card-body muted">Could not load toggles.</p>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Extension</th><th>Default</th><th>Effective</th><th class="cell-end">Override</th></tr>
        </thead>
        <tbody>
          <tr v-for="extension in data ?? []" :key="extension.id" :data-toggle-row="extension.id">
            <td>
              <span class="cell-name">
                <strong>{{ extension.name }}</strong>
                <span class="muted">{{ extension.id }}</span>
              </span>
            </td>
            <td><span class="muted">{{ extension.enabledByDefault ? 'Enabled' : 'Disabled' }}</span></td>
            <td>
              <span class="badge" :class="extension.active ? 'success' : ''">{{ extension.active ? 'Active' : 'Inactive' }}</span>
            </td>
            <td class="cell-end">
              <div class="segmented" role="group" :aria-label="`Override for ${extension.id}`">
                <button type="button" :aria-pressed="extension.override === false" :disabled="busy === extension.id" @click="persist(extension.id, false)">Disable</button>
                <button type="button" :aria-pressed="extension.override === true" :disabled="busy === extension.id" @click="persist(extension.id, true)">Enable</button>
                <button type="button" :aria-pressed="extension.override === null" :disabled="busy === extension.id || extension.override === null" @click="persist(extension.id, null)">Reset</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
