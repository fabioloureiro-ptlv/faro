<script setup lang="ts">
import { BU_LABEL, type PainelFilters } from '../domain';

defineProps<{ bu: PainelFilters['bu'] }>();
const emit = defineEmits<{ select: [bu: PainelFilters['bu']] }>();

const BU_OPTIONS = [
  ['todas', 'Ecossistema (todos)'],
  ['ecom', BU_LABEL.ecom],
  ['saude', BU_LABEL.saude],
  ['fintech', BU_LABEL.fintech],
  ['servicos', BU_LABEL.servicos],
] as const;
</script>

<template>
  <div class="bu" role="tablist" aria-label="Unidade de negócio">
    <button
      v-for="[id, label] in BU_OPTIONS"
      :key="id"
      type="button"
      role="tab"
      :aria-selected="bu === id"
      :class="{ on: bu === id }"
      @click="emit('select', id)"
    >
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.bu {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--line);
}
button {
  border: 0;
  background: none;
  padding: 8px 12px;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  font-weight: 600;
  cursor: pointer;
}
button.on {
  color: var(--brand);
  border-bottom-color: var(--brand);
}
</style>
