<script setup lang="ts">
const { can } = useModularPermissions()
useHead({ title: 'Manage quizzes' })
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <span class="eyebrow"><AppIcon name="quiz" :size="14" />Quiz extension</span>
        <h1>Manage quizzes</h1>
        <p>Nested navigation item, visible to roles with the <code>quiz.manage</code> capability.</p>
      </div>
    </header>

    <section v-if="can('quiz.manage')" class="callout">
      <AppIcon name="check" :size="16" />
      <span>You can manage quizzes. Teachers get this capability from the quiz manifest's <code>defaultRoles</code>.</span>
    </section>
    <section v-else class="card card-body denied">
      <span class="icon-chip"><AppIcon name="lock" /></span>
      <p>You need the <code>quiz.manage</code> capability. Switch the role to <strong>teacher</strong> or <strong>admin</strong>.</p>
    </section>
  </div>
</template>

<style scoped>
.denied { display: flex; align-items: center; gap: 12px; color: var(--muted); }
</style>
