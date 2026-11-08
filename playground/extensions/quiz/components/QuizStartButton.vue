<script setup lang="ts">
function startQuiz() {
  document.getElementById('quiz')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <button class="primary" type="button" data-testid="quiz-start" @click="startQuiz">
    <AppIcon name="play" :size="14" />
    Start quiz
  </button>
</template>
