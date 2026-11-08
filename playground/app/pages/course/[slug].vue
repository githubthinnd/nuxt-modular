<script setup lang="ts">
const route = useRoute()
const courseId = computed(() => String(route.params.slug))
const title = computed(() =>
  courseId.value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' '),
)
const context = computed(() => ({ courseId: courseId.value }))

useHead({ title: () => title.value })
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <span class="eyebrow"><AppIcon name="book" :size="14" />Course</span>
        <h1>{{ title }}</h1>
        <p>Host-owned course page. Actions, tabs and sidebar widgets below come from extensions.</p>
      </div>
      <PluginOutlet name="course.actions" :context="context" wrap-with="div" class="page-actions" />
    </header>

    <div class="course-layout">
      <div class="course-main">
        <section class="card">
          <div class="card-header">
            <div class="card-header-title">
              <span class="icon-chip"><AppIcon name="info" /></span>
              <div>
                <h2>Overview</h2>
                <p>Owned by the host</p>
              </div>
            </div>
          </div>
          <div class="card-body overview">
            <p>Learn how Nuxt renders pages on the server and hydrates them in the browser, and how state travels between the two.</p>
            <dl class="facts">
              <div><dt>Lessons</dt><dd>8</dd></div>
              <div><dt>Duration</dt><dd>2h 15m</dd></div>
              <div><dt>Level</dt><dd>Beginner</dd></div>
            </dl>
          </div>
        </section>

        <PluginOutlet name="course.tabs" :context="context">
          <template #empty>
            <div class="card card-body empty">
              <span class="icon-chip"><AppIcon name="extensions" /></span>
              <p>No extension adds a tab for your role.</p>
            </div>
          </template>
        </PluginOutlet>
      </div>

      <PluginOutlet name="course.sidebar" :context="context" wrap-with="aside" item-tag="section" class="course-sidebar" />
    </div>
  </div>
</template>

<style scoped>
.course-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}
.course-main { display: grid; gap: 20px; min-width: 0; }
.course-sidebar { display: grid; gap: 16px; position: sticky; top: 24px; }
.overview { display: grid; gap: 16px; color: var(--text-2); }
.facts { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; }
.facts div { flex: 1 1 120px; padding: 10px 14px; border-radius: var(--radius); background: var(--surface-2); }
.facts dt { font-size: 12px; color: var(--muted); }
.facts dd { margin: 2px 0 0; font-weight: 600; color: var(--text); }
.empty { display: flex; align-items: center; gap: 12px; color: var(--muted); }
@media (max-width: 960px) {
  .course-layout { grid-template-columns: minmax(0, 1fr); }
  .course-sidebar { position: static; }
}
</style>
