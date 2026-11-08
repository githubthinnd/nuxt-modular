<script setup lang="ts">
const { can } = useModularPermissions()
const { data, refresh, status } = await useFetch('/api/analytics/stats', { key: 'analytics-banner:stats-page' })
useHead({ title: 'Analytics' })
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <span class="eyebrow"><AppIcon name="chart" :size="14" />Analytics extension</span>
        <h1>Analytics</h1>
        <p>Counters fed by server hooks: <code>nitro:request</code> and the quiz extension's <code>quiz:submitted</code>.</p>
      </div>
      <button v-if="can('analytics.view')" type="button" :disabled="status === 'pending'" @click="refresh()">
        <AppIcon name="refresh" :size="14" />
        Refresh
      </button>
    </header>

    <template v-if="can('analytics.view')">
      <section class="stats" aria-label="Analytics">
        <article class="card stat">
          <div class="stat-top"><span class="stat-label">API requests</span><span class="icon-chip"><AppIcon name="trend" /></span></div>
          <span class="stat-value">{{ data?.requests ?? 0 }}</span>
          <span class="stat-foot">Counted by <code>nitro:request</code></span>
        </article>
        <article class="card stat">
          <div class="stat-top"><span class="stat-label">Page views</span><span class="icon-chip info"><AppIcon name="eye" /></span></div>
          <span class="stat-value">{{ data?.pageViews ?? 0 }}</span>
          <span class="stat-foot">Client-side navigations</span>
        </article>
        <article class="card stat">
          <div class="stat-top"><span class="stat-label">Quiz submissions</span><span class="icon-chip success"><AppIcon name="quiz" /></span></div>
          <span class="stat-value">{{ data?.quizSubmissions ?? 0 }}</span>
          <span class="stat-foot">Last score: {{ data?.lastQuizScore ?? '—' }}</span>
        </article>
      </section>

      <section class="card">
        <div class="card-header"><h2>Top paths</h2></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Path</th><th class="cell-end">Views</th></tr></thead>
            <tbody>
              <tr v-for="entry in data?.topPaths ?? []" :key="entry.path">
                <td><code>{{ entry.path }}</code></td>
                <td class="cell-end">{{ entry.views }}</td>
              </tr>
              <tr v-if="!data?.topPaths?.length">
                <td colspan="2" class="muted">No navigation tracked yet — click around the app.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <section v-else class="card card-body denied">
      <span class="icon-chip"><AppIcon name="lock" /></span>
      <p>You need the <code>analytics.view</code> capability. Switch the role to <strong>admin</strong>.</p>
    </section>
  </div>
</template>

<style scoped>
.denied { display: flex; align-items: center; gap: 12px; color: var(--muted); }
</style>
