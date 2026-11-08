<script setup lang="ts">
import { QUESTIONS } from '../questions'

const props = defineProps<{ context: { courseId?: string } }>()

const answers = reactive<Record<string, string>>({})
const result = ref<{ score: number } | null>(null)
const pending = ref(false)
const error = ref('')
const answered = computed(() => QUESTIONS.filter((question) => answers[question.id]).length)

async function submit() {
  pending.value = true
  error.value = ''
  try {
    result.value = await $fetch<{ score: number }>('/api/quiz/submit', {
      method: 'POST',
      body: { courseId: props.context.courseId ?? 'unknown', answers },
    })
  } catch {
    error.value = 'Could not submit the quiz.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section id="quiz" class="card" data-testid="quiz-tab">
    <div class="card-header">
      <div class="card-header-title">
        <span class="icon-chip"><AppIcon name="quiz" /></span>
        <div>
          <h2>Quiz</h2>
          <p>{{ QUESTIONS.length }} questions · from the <code>quiz</code> extension</p>
        </div>
      </div>
      <span class="badge plain">{{ answered }}/{{ QUESTIONS.length }} answered</span>
    </div>

    <form class="card-body quiz-form" @submit.prevent="submit">
      <fieldset v-for="(question, index) in QUESTIONS" :key="question.id">
        <legend><span class="number">{{ index + 1 }}</span>{{ question.text }}</legend>
        <div class="options">
          <label v-for="option in question.options" :key="option" class="option">
            <input v-model="answers[question.id]" type="radio" :name="question.id" :value="option">
            <span>{{ option }}</span>
          </label>
        </div>
      </fieldset>

      <div class="quiz-footer">
        <button class="primary" type="submit" :disabled="pending">Submit</button>
        <p v-if="result" class="score" data-testid="quiz-score">
          <AppIcon name="check" :size="16" />
          Score <strong>{{ result.score }}</strong> <span class="muted">· includes the +5 bonus filter</span>
        </p>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </form>
  </section>
</template>

<style scoped>
.quiz-form { display: grid; gap: 20px; }
fieldset { margin: 0; padding: 0; border: 0; display: grid; gap: 10px; }
legend { display: flex; align-items: center; gap: 10px; padding: 0; margin-bottom: 10px; font-weight: 600; color: var(--text); }
.number {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--surface-2);
  color: var(--muted);
}
.options { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text-2);
  transition: border-color 0.12s, background-color 0.12s;
}
.option:hover { border-color: var(--border-strong); background: var(--surface-2); }
.option:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-text); }
.option input { accent-color: var(--accent); margin: 0; }
.quiz-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding-top: 4px; border-top: 1px solid var(--border); padding-top: 16px; }
.score { display: inline-flex; align-items: center; gap: 6px; color: var(--success); }
.score strong { font-size: 16px; }
.error { color: var(--danger); }
</style>
