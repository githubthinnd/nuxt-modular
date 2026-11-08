<script setup lang="ts">
import { QUESTIONS } from '../questions'
</script>

<template>
  <article class="card stat" data-testid="quiz-metric">
    <div class="stat-top">
      <span class="stat-label">Quiz questions</span>
      <span class="icon-chip success"><AppIcon name="quiz" /></span>
    </div>
    <span class="stat-value">{{ QUESTIONS.length }}</span>
    <span class="stat-foot">From the quiz extension</span>
  </article>
</template>
