<script setup lang="ts">
const { data } = await useFetch('/api/analytics/stats', { key: 'analytics-banner:stats' })
</script>

<template>
  <article class="card stat" data-testid="page-views-metric">
    <div class="stat-top">
      <span class="stat-label">Page views</span>
      <span class="icon-chip info"><AppIcon name="eye" /></span>
    </div>
    <span class="stat-value">{{ data?.pageViews ?? 0 }}</span>
    <span class="stat-foot">{{ data?.quizSubmissions ?? 0 }} quiz submissions · analytics extension</span>
  </article>
</template>
