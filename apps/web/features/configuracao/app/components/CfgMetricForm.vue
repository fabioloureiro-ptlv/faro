<script setup lang="ts">
// Criar métrica sob demanda (CFG-05). Vira MetricDefinition em rascunho e pedido para a frente 4.
import type { MetricDefinition } from '@faro/contracts';
import { ApiError } from '../composables/useFaroApi';
import { useExperimentDraft } from '../composables/useExperimentDraft';

const props = defineProps<{ section?: string }>();
const emit = defineEmits<{ created: [m: MetricDefinition]; cancel: [] }>();
const { addMetric } = useExperimentDraft();
// Ajuste 15/10: pode haver mais de um formulário na tela (NORTE e guardrails) — ids únicos.
const uid = useId();
const id = (k: string) => `${uid}-${k}`;
const form = reactive({ name: '', kind: 'proportion' as 'proportion' | 'mean', definition: '', base: '', sd: '' });
const error = ref('');
const busy = ref(false);
const num = (s: string) => Number.parseFloat(s.replace(',', '.'));

async function submit() {
  error.value = '';
  const b = num(form.base);
  const sd = num(form.sd);
  if (form.name.trim().length < 3) return (error.value = 'Dê um nome com pelo menos 3 caracteres.');
  if (form.definition.trim().length < 10) return (error.value = 'Explique como a métrica é calculada.');
  if (!(b > 0) || (form.kind === 'proportion' && b >= 100))
    return (error.value = form.kind === 'proportion' ? 'Informe a taxa atual entre 0 e 100%.' : 'Informe a média atual.');
  if (form.kind === 'mean' && !(sd > 0)) return (error.value = 'Informe o desvio padrão.');
  busy.value = true;
  try {
    const m = await addMetric({
      name: form.name.trim(),
      kind: form.kind,
      definition: form.definition.trim(),
      ...(props.section ? { section: props.section } : {}),
      baseline: form.kind === 'proportion' ? b / 100 : b,
      ...(form.kind === 'mean' ? { stdDev: sd } : {}),
    });
    emit('created', m);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Não foi possível criar a métrica.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="mform" @submit.prevent="submit">
    <h3>Nova métrica{{ section ? ` — área ${section}` : '' }}</h3>
    <p class="small muted" style="margin: 0 0 8px">
      Entra no catálogo como rascunho e fica disponível neste e nos próximos experimentos. O time de métricas publica o cálculo oficial.
    </p>
    <div class="pair">
      <div><label class="sub" :for="id('nm-name')">Nome</label><input :id="id('nm-name')" v-model="form.name" type="text" placeholder="Ex.: Pedidos com 2+ itens"></div>
      <div>
        <label class="sub" :for="id('nm-kind')">Tipo</label>
        <select :id="id('nm-kind')" v-model="form.kind">
          <option value="proportion">Taxa (% de usuários que fazem algo)</option>
          <option value="mean">Valor médio (R$, itens, minutos)</option>
        </select>
      </div>
    </div>
    <label class="sub" :for="id('nm-def')" style="display: block; margin-top: 10px">Como é calculada</label>
    <input :id="id('nm-def')" v-model="form.definition" type="text" :placeholder="form.kind === 'mean' ? 'Ex.: receita total ÷ usuários expostos' : 'Ex.: usuários com pedido de 2+ itens ÷ usuários expostos'">
    <div class="pair" style="margin-top: 10px">
      <div>
        <label class="sub" :for="id('nm-base')">{{ form.kind === 'proportion' ? 'Taxa atual (%)' : 'Média atual' }}</label>
        <input :id="id('nm-base')" v-model="form.base" type="text" inputmode="decimal" :placeholder="form.kind === 'proportion' ? 'Ex.: 12,5' : 'Ex.: 189'">
      </div>
      <div v-if="form.kind === 'mean'">
        <label class="sub" :for="id('nm-sd')">Desvio padrão</label>
        <input :id="id('nm-sd')" v-model="form.sd" type="text" inputmode="decimal" placeholder="Ex.: 240">
      </div>
    </div>
    <p class="err" role="alert">{{ error }}</p>
    <div class="row">
      <button class="btn" type="submit" :disabled="busy">Adicionar métrica</button>
      <button class="btn ghost" type="button" @click="emit('cancel')">Cancelar</button>
    </div>
  </form>
</template>

<style scoped>
.mform { border: 1px dashed var(--brand); border-radius: 14px; padding: 16px; margin-top: 12px; background: var(--brand-soft); }
</style>
