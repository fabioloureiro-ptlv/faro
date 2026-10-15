<script setup lang="ts">
import type { WizardStep } from '@faro/config-core';

const props = defineProps<{ current: WizardStep; unlocked: WizardStep[] }>();
const emit = defineEmits<{ go: [step: WizardStep] }>();
const STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: 'Design do experimento' },
  { n: 2, label: 'Público' },
  { n: 3, label: 'Sobreposição' },
  { n: 4, label: 'Revisão' },
];
const isOpen = (n: WizardStep) => props.unlocked.includes(n);
const isDone = (n: WizardStep) => n < props.current && isOpen((n + 1) as WizardStep);
</script>

<template>
  <nav aria-label="Etapas do cadastro">
    <ol class="steps">
      <li v-for="s in STEPS" :key="s.n">
        <button
          type="button"
          class="step"
          :class="{ done: isDone(s.n), locked: !isOpen(s.n) }"
          :aria-current="current === s.n ? 'step' : undefined"
          :aria-disabled="!isOpen(s.n)"
          @click="isOpen(s.n) && emit('go', s.n)"
        >
          <span class="n" aria-hidden="true">{{ isOpen(s.n) ? s.n : '🔒' }}</span>
          {{ s.label }}<span v-if="!isOpen(s.n)" class="visually-hidden"> (bloqueada até a etapa anterior ficar completa)</span>
        </button>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.steps { display: flex; gap: 6px; margin: 0 0 24px; padding: 0; list-style: none; flex-wrap: wrap; }
.step { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 7px 14px 7px 8px; cursor: pointer; font-weight: 600; color: var(--muted); }
.step .n { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; background: var(--line); color: var(--ink); }
.step[aria-current='step'] { color: var(--ink); border-color: var(--brand); }
.step[aria-current='step'] .n { background: var(--brand); color: var(--on-brand); }
.step.done .n { background: var(--ok); color: #fff; }
.step.locked { cursor: not-allowed; opacity: 0.6; }
</style>
