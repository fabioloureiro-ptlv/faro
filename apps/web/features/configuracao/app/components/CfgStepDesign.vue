<script setup lang="ts">
// Etapa 1 — Design (CFG-02 a CFG-07).
import type { Bu } from '@faro/contracts';
import type { MetricDefinition, SignificanceLabel } from '@faro/contracts';
import { isFigmaUrl, type MdeSuggestion } from '@faro/config-core';
import { ApiError } from '../composables/useFaroApi';
import { useExperimentDraft } from '../composables/useExperimentDraft';
import { BU_LABEL, fmtInt, fmtPct } from '../utils/labels';

const emit = defineEmits<{ next: [] }>();
const { experiment: exp, catalog, gate, nPerGroup, primaryMetric, baseline, designRegistered, suggestMde } = useExperimentDraft();
// Criar métrica abre com a área já escolhida no picker (ajuste de produto 14/10).
const creatingMetric = ref<'' | string>('');
// Ajuste 15/10: guardrail também pode ser criada na hora.
const creatingGuardrail = ref<'' | string>('');
const e = computed(() => exp.value!);
const d = computed(() => e.value.design);
const err = (id: string) => gate.value?.checks.find((c) => c.id === id && !c.ok)?.message;
const touched = reactive<Record<string, boolean>>({});
const show = (id: string) => (touched[id] ? err(id) : undefined);
const figErr = (u?: string) => (u && u.trim() && !isFigmaUrl(u) ? 'Use um link do Figma (https://www.figma.com/…).' : '');

function togglePrimary(id: string) {
  d.value.primaryMetricId = d.value.primaryMetricId === id ? '' : id;
  d.value.secondaryMetricIds = d.value.secondaryMetricIds.filter((x) => x !== d.value.primaryMetricId);
  delete d.value.baselineOverride;
}
function toggleIn(list: 'secondaryMetricIds' | 'guardrailMetricIds', id: string) {
  const arr = d.value[list];
  d.value[list] = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}
// Ajuste 15/10: métrica criada entra selecionada na hora, no campo em que foi criada.
function onPrimaryCreated(m: MetricDefinition) {
  creatingMetric.value = '';
  d.value.primaryMetricId = m.id;
  d.value.secondaryMetricIds = d.value.secondaryMetricIds.filter((x) => x !== m.id);
  d.value.guardrailMetricIds = d.value.guardrailMetricIds.filter((x) => x !== m.id);
  delete d.value.baselineOverride;
}
function onGuardrailCreated(m: MetricDefinition) {
  creatingGuardrail.value = '';
  if (!d.value.guardrailMetricIds.includes(m.id)) d.value.guardrailMetricIds = [...d.value.guardrailMetricIds, m.id];
}

// Ajuste 15/10: base histórica — testes parecidos com a mesma NORTE sugerem o MDE.
const mde = reactive({ data: null as MdeSuggestion | null, busy: false, erro: '' });
const LABEL: Record<SignificanceLabel, string> = {
  melhora_confirmada: 'melhora confirmada',
  tendencia_de_melhora: 'tendência de melhora',
  sem_tendencia: 'sem tendência',
  tendencia_de_queda: 'tendência de queda',
  queda_confirmada: 'queda confirmada',
};
const signed = (x: number) => `${x > 0 ? '+' : ''}${fmtPct(x)}`;
async function loadMde() {
  if (!d.value.primaryMetricId) return;
  mde.busy = true;
  mde.erro = '';
  try {
    mde.data = await suggestMde();
  } catch (err) {
    mde.erro = err instanceof ApiError ? err.message : 'Não foi possível consultar a base histórica.';
  } finally {
    mde.busy = false;
  }
}
let mdeTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => d.value.primaryMetricId,
  (id) => {
    mde.data = null;
    clearTimeout(mdeTimer);
    if (id) mdeTimer = setTimeout(() => void loadMde(), 800);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(mdeTimer));
function addVariant() {
  const key = String.fromCharCode(97 + d.value.variants.length);
  d.value.variants.push({ key, name: `Variante ${key.toUpperCase()}`, description: '' });
  equalSplit();
}
// Mídia da variante: Figma OU print — um dos dois é obrigatório (gate midia_variantes).
const mediaKind = reactive<Record<string, 'figma' | 'print'>>({});
const kindOf = (v: { key: string; printUrl?: string }) => mediaKind[v.key] ?? (v.printUrl ? 'print' : 'figma');
function onPrint(v: { printUrl?: string; figmaUrl?: string }, ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 1_500_000) {
    alert('Print muito grande (máx. 1,5 MB). Reduza a imagem ou use o link do Figma.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    v.printUrl = String(reader.result);
    touched.midia_variantes = true;
  };
  reader.readAsDataURL(file);
}
function removeVariant(i: number) {
  d.value.variants.splice(i, 1);
  equalSplit();
}
function equalSplit() {
  const n = d.value.variants.length + 1;
  e.value.allocation.split = Array.from({ length: n }, () => Math.round((1 / n) * 10000) / 10000);
}

// Linha de base da NORTE (CFG-06): taxa em % na tela, fração no modelo; cv para valor médio.
const isRate = computed(() => primaryMetric.value?.kind === 'proportion');
const baselineInput = computed({
  get: () => (baseline.value == null ? '' : isRate.value ? +(baseline.value * 100).toFixed(3) : baseline.value),
  set: (v: string | number) => {
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
    if (!(n > 0)) delete d.value.baselineOverride;
    else d.value.baselineOverride = isRate.value ? n / 100 : n;
  },
});
const catalogBaseline = computed(() => {
  const m = primaryMetric.value;
  if (!m) return '';
  return m.kind === 'proportion' ? `${((m.baseline ?? 0) * 100).toLocaleString('pt-BR')}%` : `variabilidade ${m.cv ?? '—'}`;
});
const mdePct = computed({
  get: () => Math.round(d.value.mdeRelative * 1000) / 10,
  set: (v: number) => (d.value.mdeRelative = Math.max(0, Number(v) || 0) / 100),
});
const BUS = Object.entries(BU_LABEL) as [Bu, string][];
</script>

<template>
  <div class="grid2">
    <div class="panel">
      <div v-if="!designRegistered" class="banner">
        Teste importado do DY sem design registrado. Complete o design mínimo para manter o histórico do que foi aprendido.
      </div>
      <h2>Design do experimento</h2>
      <p class="small muted" style="margin: 0 0 18px">É o documento do teste. Ele acompanha o experimento até a decisão final.</p>

      <div class="field">
        <label for="f-name">Nome do experimento</label>
        <input id="f-name" v-model="e.name" type="text" placeholder="Ex.: Selo de entrega rápida na busca" :aria-invalid="!!show('nome')" aria-describedby="e-name" @blur="touched.nome = true">
        <p id="e-name" class="err">{{ show('nome') }}</p>
      </div>
      <div class="pair">
        <div class="field">
          <label for="f-squad">Squad responsável</label>
          <input id="f-squad" v-model="e.ownerSquad" type="text" placeholder="Ex.: Squad Descoberta" :aria-invalid="!!show('squad')" aria-describedby="e-squad" @blur="touched.squad = true">
          <p id="e-squad" class="err">{{ show('squad') }}</p>
        </div>
        <fieldset class="field">
          <legend>BU</legend>
          <p class="hint">Ecossistema quando afeta mais de uma BU.</p>
          <div class="chips">
            <button v-for="[k, l] in BUS" :key="k" type="button" class="chip" :aria-pressed="e.bu === k" @click="e.bu = k">{{ l }}</button>
          </div>
        </fieldset>
      </div>

      <div class="field">
        <label for="f-ctx">Contexto</label>
        <p id="h-ctx" class="hint">Qual problema você observou e qual evidência sustenta isso (dado, pesquisa, benchmark). Mínimo de 60 caracteres.</p>
        <textarea id="f-ctx" v-model="d.context" aria-describedby="h-ctx e-ctx" :aria-invalid="!!show('contexto')" placeholder="Ex.: 38% das buscas por ração terminam sem clique quando o prazo de entrega não aparece…" @blur="touched.contexto = true" />
        <p id="e-ctx" class="err">{{ show('contexto') }}</p>
      </div>

      <fieldset class="field">
        <legend>Hipótese</legend>
        <p class="hint">Se [mudança], então [efeito na métrica], porque [motivo].</p>
        <div class="hyp">
          <label for="f-h1">Se…</label>
          <input id="f-h1" v-model="d.hypothesis.change" type="text" placeholder="mostrarmos o selo “chega amanhã” nos cards da busca" @blur="touched.hipotese = true">
          <label for="f-h2">então…</label>
          <input id="f-h2" v-model="d.hypothesis.expectedEffect" type="text" placeholder="a adição ao carrinho vai aumentar" @blur="touched.hipotese = true">
          <label for="f-h3">porque…</label>
          <input id="f-h3" v-model="d.hypothesis.because" type="text" placeholder="o cliente sabe o prazo antes de abrir o produto" @blur="touched.hipotese = true">
        </div>
        <p class="err">{{ show('hipotese') }}</p>
      </fieldset>

      <fieldset class="field">
        <legend>O que vai mudar</legend>
        <p class="hint">Descreva cada versão. Cada variante precisa do Figma <b>ou</b> de um print — um dos dois é obrigatório.</p>
        <div class="pair">
          <div>
            <label class="sub" for="f-ctrl">Controle (como é hoje)</label>
            <textarea id="f-ctrl" v-model="d.control.description" @blur="touched.controle_variantes = true" />
          </div>
          <div v-for="(v, i) in d.variants" :key="v.key">
            <div class="spread">
              <label class="sub" :for="`f-var-${v.key}`">{{ v.name }} (o que muda)</label>
              <button v-if="d.variants.length > 1" type="button" class="btn ghost small" @click="removeVariant(i)">Remover</button>
            </div>
            <textarea :id="`f-var-${v.key}`" v-model="v.description" @blur="touched.controle_variantes = true" />
            <div class="chips" style="margin-top: 8px" role="group" :aria-label="`Mídia da ${v.name}`">
              <button type="button" class="chip" :aria-pressed="kindOf(v) === 'figma'" @click="mediaKind[v.key] = 'figma'">Link do Figma</button>
              <button type="button" class="chip" :aria-pressed="kindOf(v) === 'print'" @click="mediaKind[v.key] = 'print'">Print</button>
            </div>
            <template v-if="kindOf(v) === 'figma'">
              <input v-model="v.figmaUrl" type="url" :aria-label="`Link do Figma da ${v.name}`" placeholder="https://www.figma.com/…" :aria-invalid="!!figErr(v.figmaUrl)" class="fig" @blur="touched.midia_variantes = true">
              <p class="err">{{ figErr(v.figmaUrl) }}</p>
            </template>
            <template v-else>
              <input type="file" accept="image/*" :aria-label="`Print da ${v.name}`" class="fig" @change="onPrint(v, $event)">
              <p v-if="v.printUrl" class="small muted" style="margin: 6px 0 0">
                <img :src="v.printUrl" :alt="`Print da ${v.name}`" style="max-width: 100%; max-height: 120px; border: 1px solid var(--line); border-radius: 8px">
                <button type="button" class="btn ghost small" @click="delete v.printUrl">Remover print</button>
              </p>
            </template>
          </div>
        </div>
        <button v-if="d.variants.length < 3" type="button" class="chip add" @click="addVariant">+ Adicionar variante</button>
        <p class="err">{{ show('controle_variantes') }}</p>
        <p class="err">{{ show('midia_variantes') }}</p>
      </fieldset>

      <div class="field">
        <span id="l-primary" class="lbl">Métrica primária (NORTE)</span>
        <p class="hint">Escolha a área e depois a métrica. Só uma: é ela que decide se o teste ganhou.</p>
        <CfgMetricPicker
          label="Métrica primária"
          allow-create
          :metrics="catalog"
          :selected="d.primaryMetricId ? [d.primaryMetricId] : []"
          @toggle="togglePrimary"
          @create="(area) => { creatingMetric = area; creatingGuardrail = ''; }"
        />
        <CfgMetricForm v-if="creatingMetric" :section="creatingMetric" @cancel="creatingMetric = ''" @created="onPrimaryCreated" />
        <div v-if="primaryMetric" class="basebox">
          <div>
            <label for="f-base" class="sub">{{ isRate ? 'Valor de referência atual (%)' : 'Variabilidade (desvio ÷ média)' }}</label>
            <input id="f-base" v-model.lazy="baselineInput" type="number" step="any" min="0">
          </div>
          <p class="small muted" style="margin: 0; flex: 1; min-width: 200px">
            <b>Definição:</b> {{ primaryMetric.definition }}<br>
            Catálogo: {{ catalogBaseline }}. Ajuste com o valor real da página e do público deste teste; a amostra é recalculada.
          </p>
        </div>
      </div>

      <div class="field">
        <span class="lbl">Métricas secundárias</span>
        <p class="hint">Escolha a área e depois as métricas (pode mais de uma, inclusive de áreas diferentes). Pelo menos uma.</p>
        <CfgMetricPicker label="Métricas secundárias" multiple :metrics="catalog" :selected="d.secondaryMetricIds" :disabled-ids="d.primaryMetricId ? [d.primaryMetricId] : []" @toggle="(id) => toggleIn('secondaryMetricIds', id)" />
      </div>

      <div class="field">
        <span class="lbl">Guardrails (GUARDA, opcional)</span>
        <p class="hint">Métricas que não podem piorar. Escolha por área, como nas secundárias, ou crie uma na hora.</p>
        <CfgMetricPicker
          label="Guardrails"
          multiple
          allow-create
          :metrics="catalog"
          :selected="d.guardrailMetricIds"
          :disabled-ids="d.primaryMetricId ? [d.primaryMetricId] : []"
          @toggle="(id) => toggleIn('guardrailMetricIds', id)"
          @create="(area) => { creatingGuardrail = area; creatingMetric = ''; }"
        />
        <CfgMetricForm v-if="creatingGuardrail" :section="creatingGuardrail" @cancel="creatingGuardrail = ''" @created="onGuardrailCreated" />
      </div>

      <div class="field">
        <label for="f-mde">Efeito mínimo detectável: {{ mdePct.toLocaleString('pt-BR') }}%</label>
        <p class="hint">Menor melhora relativa que vale a pena detectar. Quanto menor, mais tráfego e mais dias.</p>
        <div class="row">
          <input id="f-mde" v-model.number="mdePct" type="range" min="1" max="30" step="1" style="flex: 1; accent-color: var(--brand)">
          <input v-model.number="mdePct" type="number" min="0.5" max="99" step="0.5" aria-label="Efeito mínimo detectável em %" style="width: 90px">
        </div>
        <p class="small muted" aria-live="polite">
          <template v-if="nPerGroup">Amostra necessária: <b>{{ fmtInt(nPerGroup) }}</b> usuários por grupo (α 5%, poder 80%).</template>
          <template v-else>Escolha a métrica primária para calcular a amostra.</template>
        </p>

        <section class="histbox" aria-labelledby="hist-title" aria-live="polite">
          <div class="spread">
            <b id="hist-title" class="small">Base histórica</b>
            <button type="button" class="btn ghost small" :disabled="!d.primaryMetricId || mde.busy" @click="loadMde">
              {{ mde.busy ? 'Buscando…' : 'Sugerir pelo histórico' }}
            </button>
          </div>
          <p v-if="mde.erro" class="err" role="alert">{{ mde.erro }}</p>
          <template v-else-if="mde.data">
            <p v-if="mde.data.suggested == null || mde.data.medianAbsEffect == null" class="small muted" style="margin: 6px 0 0">
              Nenhum teste anterior com {{ primaryMetric?.name ?? 'essa métrica' }} como NORTE. Sem base para sugerir.
            </p>
            <template v-else>
              <p class="small" style="margin: 6px 0 0">
                <b>{{ mde.data.sampleCount }}</b> {{ mde.data.sampleCount === 1 ? 'teste parecido' : 'testes parecidos' }} com NORTE {{ primaryMetric?.name }}:
                efeito típico de <b>{{ fmtPct(mde.data.medianAbsEffect) }}</b> (mediana do efeito observado, sem sinal);
                {{ mde.data.improved }} {{ mde.data.improved === 1 ? 'melhorou' : 'melhoraram' }} e {{ mde.data.worsened }} {{ mde.data.worsened === 1 ? 'piorou' : 'pioraram' }}.
              </p>
              <button type="button" class="chip add" style="margin-top: 8px" @click="mdePct = Math.round(mde.data!.suggested! * 1000) / 10">
                Usar {{ fmtPct(mde.data.suggested) }} como efeito mínimo
              </button>
              <ul class="basis small muted">
                <li v-for="b in mde.data.basis" :key="b.faroId">
                  {{ b.name }} · {{ signed(b.deltaRelative) }}<template v-if="b.label"> · {{ LABEL[b.label] }}</template>
                </li>
              </ul>
            </template>
          </template>
          <p v-else class="small muted" style="margin: 6px 0 0">
            Testes anteriores com a mesma NORTE mostram que tamanho de efeito é realista para este teste.
          </p>
        </section>
      </div>
    </div>
    <div class="sticky">
      <CfgGatePanel v-if="gate" :gate="gate" @next="emit('next')" />
    </div>
  </div>
</template>

<style scoped>
.histbox { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); }
.basis { margin: 8px 0 0; padding-left: 18px; }
.hyp { display: grid; grid-template-columns: 80px 1fr; gap: 8px 10px; align-items: center; }
.hyp label { font-weight: 600; color: var(--muted); }
.fig { margin-top: 8px; font-size: 14px; }
.basebox { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-top: 14px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; }
.basebox input { width: 130px; }
</style>
