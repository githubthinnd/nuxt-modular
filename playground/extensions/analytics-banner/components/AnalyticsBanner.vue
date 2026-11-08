<script setup lang="ts">
const dismissed = useState('analytics-banner:dismissed', () => false)
</script>

<template>
  <div v-if="!dismissed" class="analytics-banner" role="status" data-testid="analytics-banner">
    <span class="message">
      <AppIcon name="trend" :size="16" />
      <span>Analytics is active: page views and quiz submissions are counted by server hooks.</span>
    </span>
    <button type="button" class="ghost small" @click="dismissed = true">
      <AppIcon name="close" :size="14" />
      Dismiss
    </button>
  </div>
</template>

<style scoped>
.analytics-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px 8px 32px;
  font-size: 13px;
  color: var(--info);
  background: var(--info-soft);
  border-bottom: 1px solid var(--info-border);
}
.message { display: inline-flex; align-items: center; gap: 8px; }
button { color: inherit; }
button:hover:not(:disabled) { color: inherit; background: var(--info-soft); }
@media (max-width: 860px) {
  .analytics-banner { padding-left: 16px; }
}
</style>
