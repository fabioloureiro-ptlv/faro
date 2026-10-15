<script setup lang="ts">
// Seletor de métricas em dois campos (ajuste de produto 14/10): primeiro a ÁREA,
// depois a MÉTRICA da área em dropdown (ajuste de 15/10). Criar métrica só
// aparece com a área escolhida.
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

// Abre na área da métrica escolhida e, na seleção única, acompanha a troca de métrica
// (ajuste 15/10: métrica recém-criada entra selecionada e o dropdown precisa mostrá-la).
watch(
  () => [...props.selected],
  (sel) => {
    if (!sel.length) return;
    const last = byId.value.get(sel[sel.length - 1]!);
    if (!last) return;
    if (!area.value || (!props.multiple && last.section !== area.value)) area.value = last.section;
  },
  { immediate: true },
);

// Dropdown da métrica: seleção única mostra a escolhida; múltipla funciona como "adicionar".
const metricSelect = computed({
  get: () => (props.multiple ? '' : (props.selected.find((id) => byId.value.get(id)?.section === area.value) ?? '')),
  set: (id: string) => {
    if (!id) return;
    if (!props.multiple) {
      const current = props.selected[0];
      if (current === id) return;
      if (current) emit('toggle', current); // limpa a atual antes de trocar
      emit('toggle', id);
    } else if (!props.selected.includes(id)) {
      emit('toggle', id);
    }
  },
});

const singleChosen = computed(() => (!props.multiple && props.selected[0] ? byId.value.get(props.selected[0]) : undefined));
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
        <label class="sub" :for="`${uid}-met`">{{ multiple ? 'Adicionar métrica da área' : 'Métrica da área' }}</label>
        <select :id="`${uid}-met`" v-model="metricSelect" :disabled="!area">
          <option value="" disabled>{{ area ? (multiple ? 'Adicionar métrica…' : 'Escolha a métrica…') : 'Escolha a área primeiro' }}</option>
          <option v-for="m in daArea" :key="m.id" :value="m.id" :disabled="disabledIds?.includes(m.id) || (multiple && selected.includes(m.id))">
            {{ m.name }}{{ m.status === 'rascunho' ? ' · rascunho' : '' }}
          </option>
        </select>
        <button v-if="allowCreate && area" type="button" class="chip add" style="margin-top: 8px" @click="emit('create', area as MetricDefinition['section'])">
          + Criar métrica em {{ area }}
        </button>
      </div>
    </div>

    <p v-if="singleChosen" class="small muted" style="margin: 8px 0 0">
      <b>{{ singleChosen.section }} · {{ singleChosen.name }}</b> — {{ singleChosen.definition }}
    </p>
    <p v-if="multiple && chosen.length" class="small" style="margin: 8px 0 0">
      Selecionadas:
      <button
        v-for="m in chosen"
        :key="m.id"
        type="button"
        class="chip mini"
        :title="`${m.definition} (clique para remover)`"
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
</style>
