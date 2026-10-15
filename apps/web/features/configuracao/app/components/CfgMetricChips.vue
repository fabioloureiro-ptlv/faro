<script setup lang="ts">
// Seletor de métricas do catálogo (CFG-04). A definição aparece no hover e no foco.
import type { MetricDefinition } from '@faro/contracts';

const props = defineProps<{
  metrics: MetricDefinition[];
  selected: string[];
  multiple?: boolean;
  disabledIds?: string[];
  label: string;
}>();
const emit = defineEmits<{ toggle: [id: string] }>();
const uid = useId();
const sections = computed(() => {
  const map = new Map<string, MetricDefinition[]>();
  for (const m of props.metrics) map.set(m.section, [...(map.get(m.section) ?? []), m]);
  return [...map.entries()];
});
</script>

<template>
  <div role="group" :aria-label="label">
    <div v-for="[section, list] in sections" :key="section" class="sec">
      <div class="sub">{{ section }}</div>
      <div class="chips">
        <span v-for="m in list" :key="m.id" class="tipwrap">
          <button
            type="button"
            class="chip"
            :aria-pressed="selected.includes(m.id)"
            :disabled="disabledIds?.includes(m.id)"
            :aria-describedby="`${uid}-${m.id}`"
            @click="emit('toggle', m.id)"
          >
            {{ m.name }}<span v-if="m.status === 'rascunho'" class="small muted"> · rascunho</span>
          </button>
          <span :id="`${uid}-${m.id}`" role="tooltip" class="tip">{{ m.definition }}</span>
        </span>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.sec { margin-bottom: 10px; }
.tipwrap { position: relative; display: inline-flex; }
.tip { position: absolute; left: 0; bottom: calc(100% + 6px); z-index: 10; width: max-content; max-width: 280px; background: var(--ink); color: var(--bg); font-size: 12.5px; padding: 8px 10px; border-radius: 8px; opacity: 0; pointer-events: none; transition: opacity 0.15s; }
.tipwrap:hover .tip, .tipwrap:focus-within .tip { opacity: 1; }
</style>
