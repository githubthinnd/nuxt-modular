<script setup lang="ts">
defineProps<{ title: string; context: { courseId?: string } }>()

const completed = 1
const total = 2
</script>

<template>
  <div class="card card-body widget" data-testid="quiz-progress">
    <div class="widget-head">
      <h3>{{ title }}</h3>
      <span class="badge success">{{ Math.round((completed / total) * 100) }}%</span>
    </div>
    <div class="bar" role="progressbar" :aria-valuenow="completed" aria-valuemin="0" :aria-valuemax="total" aria-label="Quizzes completed">
      <span :style="{ width: `${(completed / total) * 100}%` }" />
    </div>
    <p class="muted">{{ completed }} of {{ total }} quizzes completed in <code>{{ context.courseId }}</code></p>
  </div>
</template>

<style scoped>
.widget { display: grid; gap: 12px; }
.widget-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.bar { height: 8px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), #8b5cf6); }
p { font-size: 13px; }
</style>
