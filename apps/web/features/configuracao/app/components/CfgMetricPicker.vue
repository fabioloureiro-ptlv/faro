<script setup lang="ts">
// Seletor de métricas em dois campos (ajuste de produto 14/10): primeiro a ÁREA,
// depois a métrica daquela área. Criar métrica só aparece com a área escolhida.
import type { MetricDefinition } from '@faro/contracts';

const props = defineProps<{
  metrics: MetricDefinition[];
  selected: string[];
  multiple?: boolean;
  disabledIds?: string[];
  label: string;
  allowCreate?: boolean;
}>();
const emit = defineEmits<{ toggle: [id: string]; create: [section: MetricDefinition['section']] }>();
const uid = useId();

const area = ref<MetricDefinition['section'] | ''>('');
const areas = computed(() => [...new Set(props.metrics.map((m) => m.section))]);
const daArea = computed(() => props.metrics.filter((m) => m.section === area.value));
const byId = computed(() => new Map(props.metrics.map((m) => [m.id, m])));
const chosen = computed(() =>
  props.selected.map((id) => byId.value.get(id)).filter((m): m is MetricDefinition => !!m),
);

// Com uma métrica já escolhida, abre na área dela.
watch(
  () => props.selected,
  (sel) => {
    if (!area.value && sel.length) area.value = byId.value.get(sel[0]!)?.section ?? '';
  },
  { immediate: true },
);
</script>

<template>
  <div role="group" :aria-label="label">
    <div class="pair picker">
      <div>
        <label class="sub" :for="`${uid}-area`">Área</label>
        <select :id="`${uid}-area`" v-model="area">
          <option value="" disabled>Escolha a área…</option>
          <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
      <div>
        <span class="sub" style="display: block">Métrica{{ multiple ? 's' : '' }} da área</span>
        <div v-if="area" class="chips" style="margin-top: 6px">
          <span v-for="m in daArea" :key="m.id" class="tipwrap">
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
          <button v-if="allowCreate" type="button" class="chip add" @click="emit('create', area as MetricDefinition['section'])">
            + Criar métrica em {{ area }}
          </button>
        </div>
        <p v-else class="small muted" style="margin: 8px 0 0">Escolha a área para ver as métricas.</p>
      </div>
    </div>
    <p v-if="multiple && chosen.length" class="small" style="margin: 8px 0 0">
      Selecionadas:
      <button
        v-for="m in chosen"
        :key="m.id"
        type="button"
        class="chip mini"
        :title="`Remover ${m.name}`"
        @click="emit('toggle', m.id)"
      >
        {{ m.section }} · {{ m.name }} ×
      </button>
    </p>
    <slot />
  </div>
</template>

<style scoped>
.picker { align-items: start; }
.picker select { width: 100%; }
.mini { margin: 2px 4px 0 0; font-size: 12.5px; }
.tipwrap { position: relative; display: inline-flex; }
.tip { position: absolute; left: 0; bottom: calc(100% + 6px); z-index: 10; width: max-content; max-width: 280px; background: var(--ink); color: var(--bg); font-size: 12.5px; padding: 8px 10px; border-radius: 8px; opacity: 0; pointer-events: none; transition: opacity 0.15s; }
.tipwrap:hover .tip, .tipwrap:focus-within .tip { opacity: 1; }
</style>
