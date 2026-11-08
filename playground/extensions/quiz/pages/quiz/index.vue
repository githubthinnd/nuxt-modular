<script setup lang="ts">
import { QUESTIONS } from '../../questions'

const { can } = useModularPermissions()
useHead({ title: 'Quizzes' })
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <span class="eyebrow"><AppIcon name="quiz" :size="14" />Quiz extension</span>
        <h1>Quizzes</h1>
        <p>This page is contributed by the <code>quiz</code> extension; the host has no file for it.</p>
      </div>
      <NuxtLink v-if="can('quiz.manage')" to="/quiz/manage" class="manage-link">
        Manage quizzes <AppIcon name="arrow" :size="14" />
      </NuxtLink>
    </header>

    <section class="card">
      <div class="card-header">
        <h2>Question bank</h2>
        <span class="badge plain">{{ QUESTIONS.length }} questions</span>
      </div>
      <ol class="questions">
        <li v-for="(question, index) in QUESTIONS" :key="question.id">
          <span class="number">{{ index + 1 }}</span>
          <div>
            <p class="text">{{ question.text }}</p>
            <p class="muted">{{ question.options.length }} options</p>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.manage-link { display: inline-flex; align-items: center; gap: 6px; font-weight: 550; }
.questions { list-style: none; margin: 0; padding: 0; }
.questions li { display: flex; gap: 14px; align-items: flex-start; padding: 14px 20px; border-bottom: 1px solid var(--border); }
.questions li:last-child { border-bottom: 0; }
.number {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  background: var(--accent-soft);
  color: var(--accent-text);
}
.text { font-weight: 550; color: var(--text); }
.questions .muted { font-size: 12px; margin-top: 2px; }
</style>
