<script setup lang="ts">
// Etapa 2 — Público e alocação (CFG-08), em duas abas (ajuste de produto 14/10):
// 1) Definição: onde o teste aparece e quem entra, sem estimativas.
// 2) Público-alvo: a query de segmentação da frente 3, o processamento da
//    estimativa real (BigQuery) e só então os elegíveis por dia.
import { audienceAttributeFor, defaultAudienceParams } from '@faro/contracts';
import type { AudienceOrigin, AudienceShortcut, PageTarget, Platform } from '@faro/contracts';
import type { DateSuggestion, DateWindow } from '@faro/config-core';
import { ApiError, useFaroApi } from '../composables/useFaroApi';
import { useExperimentDraft } from '../composables/useExperimentDraft';
import { PLATFORM_LABEL, fmtDate, fmtInt } from '../utils/labels';

const emit = defineEmits<{ next: [] }>();
const { experiment: exp, pageCatalog, shortcuts, eligibleDaily, nPerGroup, duration, audience, saveState, suggestDates } = useExperimentDraft();
const api = useFaroApi();
const e = computed(() => exp.value!);
const a = computed(() => e.value.allocation);
const groups = computed(() => ['Controle', ...e.value.design.variants.map((v) => v.name)]);
const PLATS = Object.entries(PLATFORM_LABEL) as [Platform, string][];

const aba = ref<'definicao' | 'alvo'>('definicao');

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

// ---- Páginas precisas (ajuste 15/10): URL no site e caminho no app, por página escolhida.
const pageName = (id: string) => pageCatalog.value?.pages.find((p) => p.id === id)?.name ?? id;
const hasSite = computed(() => a.value.platforms.includes('site'));
const hasApp = computed(() => a.value.platforms.some((p) => p !== 'site'));
const targetOf = (id: string): PageTarget | undefined => a.value.pageTargets?.find((t) => t.pageId === id);
function togglePage(id: string) {
  const adding = !a.value.pages.includes(id);
  a.value.pages = toggle(a.value.pages, id);
  let targets = (a.value.pageTargets ?? []).filter((t) => a.value.pages.includes(t.pageId));
  // Pré-preenche com o valor canônico do catálogo, quando a frente 3 o publicar.
  const cat = pageCatalog.value?.pages.find((p) => p.id === id);
  if (adding && cat && (cat.urlPattern || cat.appPath) && !targets.some((t) => t.pageId === id))
    targets = [...targets, { pageId: id, ...(cat.urlPattern ? { urlPattern: cat.urlPattern } : {}), ...(cat.appPath ? { appPath: cat.appPath } : {}) }];
  if (targets.length) a.value.pageTargets = targets;
  else delete a.value.pageTargets;
}
function setTarget(id: string, field: 'urlPattern' | 'appPath', raw: string) {
  const list = (a.value.pageTargets ?? []).map((t) => ({ ...t }));
  let t = list.find((x) => x.pageId === id);
  if (!t) {
    t = { pageId: id };
    list.push(t);
  }
  const v = raw.trim();
  if (v) t[field] = v;
  else delete t[field];
  const kept = list.filter((x) => x.urlPattern || x.appPath);
  if (kept.length) a.value.pageTargets = kept;
  else delete a.value.pageTargets;
}

// ---- Públicos pré-segmentados (ajuste 15/10): agrupados pela origem, com a fonte visível.
const ORIGIN_LABEL: Record<AudienceOrigin['system'], string> = {
  bigquery: 'Segmentações prontas (regra ou SQL versionado, processadas no BigQuery)',
  dy: 'Públicos já criados no DY',
  faro: 'Públicos publicados pelo Faro',
  manual: 'Informados pelo time',
};
const groupedShortcuts = computed(() => {
  const map = new Map<AudienceOrigin['system'], AudienceShortcut[]>();
  for (const s of shortcuts.value) {
    const k = s.origin?.system ?? 'manual';
    map.set(k, [...(map.get(k) ?? []), s]);
  }
  return [...map.entries()];
});
// Público que já existe no DY (atributo ou segmento criado no console): entra como manual com dyAttribute.
const dyAud = reactive({ open: false, name: '', attribute: '', share: '', erro: '' });
function useDyAudience() {
  dyAud.erro = '';
  const pct = Number.parseFloat(dyAud.share.replace(',', '.'));
  if (dyAud.name.trim().length < 3) return (dyAud.erro = 'Dê o nome do público como está no DY.');
  if (!/^[A-Za-z0-9_.:-]{2,80}$/.test(dyAud.attribute.trim())) return (dyAud.erro = 'Informe o atributo ou ID do público no DY (letras, números, _ . : -).');
  if (!(pct > 0 && pct <= 100)) return (dyAud.erro = 'Informe o tamanho estimado do público, em % da base (0 a 100).');
  e.value.audience = { description: dyAud.name.trim(), source: 'manual', estimatedShare: pct / 100, dyAttribute: dyAud.attribute.trim() };
  seg.sql = '';
  seg.clientes = null;
  seg.erro = '';
  dyAud.open = false;
}
const existingDy = computed(() => (e.value.audience.source === 'manual' && e.value.audience.dyAttribute ? e.value.audience.dyAttribute : ''));

function pickShortcut(id: string) {
  const s = shortcuts.value.find((x) => x.id === id)!;
  // Segmento com parâmetros começa nos padrões do catálogo; o atributo no DY acompanha o valor escolhido.
  const params = defaultAudienceParams(s.parameters);
  const attribute = audienceAttributeFor(s.dyAttribute, s.parameters, params);
  e.value.audience = {
    description: s.name,
    source: 'atalho',
    estimatedShare: s.share,
    ...(attribute ? { dyAttribute: attribute } : {}),
    ...(s.parameters?.length ? { params } : {}),
  };
  seg.sql = '';
  seg.clientes = null;
  seg.erro = '';
}

// ---- Sugestão de datas (ajuste 15/10): pela duração mínima, com os testes interpostos.
const dates = reactive({ data: null as DateSuggestion | null, busy: false, erro: '' });
const canSuggest = computed(() => a.value.pages.length > 0 && a.value.platforms.length > 0);
async function loadDates() {
  if (!canSuggest.value) return;
  dates.busy = true;
  dates.erro = '';
  try {
    dates.data = await suggestDates();
  } catch (err) {
    dates.erro = err instanceof ApiError ? err.message : 'Não foi possível sugerir as datas.';
  } finally {
    dates.busy = false;
  }
}
function applyDates(w: DateWindow) {
  a.value.startDate = w.startDate;
  a.value.endDate = w.endDate;
}
onMounted(() => {
  if (canSuggest.value) void loadDates();
});
const activeShortcut = computed(() => shortcuts.value.find((s) => s.name.toLowerCase() === e.value.audience.description.trim().toLowerCase()));
function onDescription(v: string) {
  const s = shortcuts.value.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
  if (s) return pickShortcut(s.id);
  e.value.audience = { description: v, source: 'manual', estimatedShare: e.value.audience.source === 'atalho' ? 1 : (e.value.audience.estimatedShare ?? 1) };
}
const sharePct = computed({
  get: () => Math.round((e.value.audience.estimatedShare ?? 1) * 1000) / 10,
  set: (v: number) => (e.value.audience.estimatedShare = Math.min(100, Math.max(0.1, Number(v) || 100)) / 100),
});
const splitPct = (i: number) => Math.round((a.value.split[i] ?? 0) * 1000) / 10;
function setSplit(i: number, v: number) {
  const next = [...a.value.split];
  next[i] = Math.max(0, Number(v) || 0) / 100;
  a.value.split = next;
}
const splitSum = computed(() => Math.round(a.value.split.reduce((s, x) => s + x, 0) * 1000) / 10);
const failing = computed(() => audience.value.filter((c) => !c.ok && c.id !== 'viabilidade'));
const tone = (lvl: string) => (lvl === 'bloqueio' ? 'riskp' : 'warnp');
const slack = computed(() => (duration.value?.periodDays != null && duration.value.durationDays != null ? duration.value.periodDays - duration.value.durationDays : null));

// Pré-requisitos mínimos para montar o público-alvo (a viabilidade fica para a aba 2).
const definicaoOk = computed(
  () => e.value.audience.description.trim().length >= 3 && a.value.pages.length > 0 && a.value.platforms.length > 0 && splitSum.value === 100,
);

// ---- Aba público-alvo: código de segmentação e processamento (frente 3) ----
const seg = reactive({ sql: '', fonte: '', gigabytes: 0, clientes: null as number | null, erro: '', carregando: false });
const temCodigo = computed(() => !!activeShortcut.value && (!!activeShortcut.value.rule || !!activeShortcut.value.sqlRef || !!activeShortcut.value.sql));

// Parâmetros do segmento escolhido: o valor do experimento, ou o padrão do catálogo.
const paramList = computed(() => activeShortcut.value?.parameters ?? []);
const paramValues = computed<Record<string, number>>(() => ({
  ...defaultAudienceParams(activeShortcut.value?.parameters),
  ...(e.value.audience.params ?? {}),
}));
function setParam(name: string, raw: string) {
  const s = activeShortcut.value;
  const value = Number(raw);
  if (!s || raw.trim() === '' || !Number.isFinite(value)) return;
  const next = { ...paramValues.value, [name]: value };
  e.value.audience.params = next;
  const attribute = audienceAttributeFor(s.dyAttribute, s.parameters, next);
  if (attribute) e.value.audience.dyAttribute = attribute;
  // A estimativa anterior era de outro valor.
  seg.sql = '';
  seg.clientes = null;
  seg.erro = '';
}
const queryParams = computed(() => (paramList.value.length ? paramValues.value : undefined));

async function puxarCodigo() {
  if (!activeShortcut.value) return;
  seg.erro = '';
  seg.carregando = true;
  try {
    const r = await api.audienceSql(activeShortcut.value.id, queryParams.value);
    seg.sql = r.sql;
    seg.fonte = r.source === 'sqlRef' ? 'SQL versionado (data/models/audiences)' : r.source === 'sql' ? 'SQL guardado no catálogo' : 'gerado da regra do atalho';
  } catch (err) {
    seg.erro = err instanceof ApiError ? err.message : 'Não foi possível puxar o código de segmentação.';
  } finally {
    seg.carregando = false;
  }
}

async function processar() {
  if (!activeShortcut.value) return;
  seg.erro = '';
  seg.carregando = true;
  try {
    const r = await api.audienceEstimate(activeShortcut.value.id, true, queryParams.value);
    seg.sql = r.sql;
    seg.gigabytes = r.gigabytes;
    seg.clientes = r.clientes ?? null;
  } catch (err) {
    seg.erro = err instanceof ApiError ? err.message : 'Não foi possível processar a estimativa no BigQuery.';
  } finally {
    seg.carregando = false;
  }
}
</script>

<template>
  <div>
    <div class="chips" role="tablist" aria-label="Abas do público" style="margin-bottom: 14px">
      <button type="button" class="chip" role="tab" :aria-selected="aba === 'definicao'" :aria-pressed="aba === 'definicao'" @click="aba = 'definicao'">1 · Definição</button>
      <button type="button" class="chip" role="tab" :aria-selected="aba === 'alvo'" :aria-pressed="aba === 'alvo'" :disabled="!definicaoOk" @click="aba = 'alvo'">2 · Público-alvo</button>
    </div>

    <div v-if="aba === 'definicao'" class="panel">
      <h2>Público e alocação — definição</h2>
      <p class="small muted" style="margin: 0 0 18px">Onde o teste aparece e quem entra. O tamanho do grupo é montado na próxima aba, com o código de segmentação.</p>

      <fieldset class="field">
        <legend>Plataformas</legend>
        <div class="chips">
          <button v-for="[k, l] in PLATS" :key="k" type="button" class="chip" :aria-pressed="a.platforms.includes(k)" @click="a.platforms = toggle(a.platforms, k)">{{ l }}</button>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Páginas</legend>
        <div class="chips">
          <button v-for="p in pageCatalog?.pages ?? []" :key="p.id" type="button" class="chip" :aria-pressed="a.pages.includes(p.id)" @click="togglePage(p.id)">{{ p.name }}</button>
        </div>
        <div v-if="a.pages.length" class="targets">
          <p class="hint" style="margin: 10px 0 6px">
            Onde exatamente: URL ou caminho no site e rota ou tela no app. Vai para a ficha do DY como condição de página.
          </p>
          <div v-for="id in a.pages" :key="id" class="trow">
            <span class="sub">{{ pageName(id) }}</span>
            <input
              v-if="hasSite"
              type="text"
              :value="targetOf(id)?.urlPattern ?? ''"
              :aria-label="`URL de ${pageName(id)} no site`"
              placeholder="Site: /carrinho ou https://www.petlove.com.br/…"
              @input="setTarget(id, 'urlPattern', ($event.target as HTMLInputElement).value)"
            >
            <input
              v-if="hasApp"
              type="text"
              :value="targetOf(id)?.appPath ?? ''"
              :aria-label="`Caminho de ${pageName(id)} no app`"
              placeholder="App: CartScreen ou app://carrinho"
              @input="setTarget(id, 'appPath', ($event.target as HTMLInputElement).value)"
            >
          </div>
        </div>
      </fieldset>

      <div class="field">
        <label for="f-aud">Quem entra no teste</label>
        <p id="h-aud" class="hint">Descreva o público com as palavras do seu time: categoria comprada, espécie, plano, região, comportamento.</p>
        <input id="f-aud" :value="e.audience.description" type="text" aria-describedby="h-aud" placeholder="Ex.: pessoas que compraram tapete higiênico nos últimos 90 dias" @input="onDescription(($event.target as HTMLInputElement).value)">
        <p class="small muted" style="margin: 10px 0 6px">Públicos pré-segmentados</p>
        <div v-for="[system, list] in groupedShortcuts" :key="system" class="origin">
          <div class="sub">{{ ORIGIN_LABEL[system] }}</div>
          <div class="chips" role="group" :aria-label="ORIGIN_LABEL[system]">
            <button v-for="s in list" :key="s.id" type="button" class="chip" :aria-pressed="activeShortcut?.id === s.id" :title="s.origin?.label" @click="pickShortcut(s.id)">{{ s.name }}</button>
          </div>
        </div>
        <p v-if="activeShortcut?.origin" class="small muted" style="margin: 8px 0 0">Fonte: {{ activeShortcut.origin.label }}.</p>
        <p v-else-if="existingDy" class="small muted" style="margin: 8px 0 0">Público já criado no DY · atributo <code>{{ existingDy }}</code>.</p>
        <div v-for="p in paramList" :key="p.name" class="field param">
          <label :for="`f-param-${p.name}`">{{ p.label }}</label>
          <input
            :id="`f-param-${p.name}`"
            type="number"
            :min="p.min"
            :max="p.max"
            :step="p.type === 'integer' ? 1 : 'any'"
            :value="paramValues[p.name]"
            @change="setParam(p.name, ($event.target as HTMLInputElement).value)"
          >
          <p v-if="p.description || p.unit" class="hint">{{ p.description }}<span v-if="p.unit"> Em {{ p.unit }}.</span></p>
        </div>

        <button type="button" class="chip add" style="margin-top: 10px" :aria-expanded="dyAud.open" @click="dyAud.open = !dyAud.open">+ Usar público já criado no DY</button>
        <form v-if="dyAud.open" class="dyform" @submit.prevent="useDyAudience">
          <p class="small muted" style="margin: 0 0 8px">Para públicos que já existem no console do DY. O Faro só registra o nome e o atributo; a regra continua no DY.</p>
          <div class="pair">
            <div><label class="sub" for="dy-name">Nome do público</label><input id="dy-name" v-model="dyAud.name" type="text" placeholder="Ex.: Clientes inadimplentes há 60 dias"></div>
            <div><label class="sub" for="dy-attr">Atributo ou ID no DY</label><input id="dy-attr" v-model="dyAud.attribute" type="text" placeholder="Ex.: inadimplente_60d"></div>
          </div>
          <div class="field" style="max-width: 280px; margin-top: 10px">
            <label class="sub" for="dy-share">Tamanho estimado (% da base)</label>
            <input id="dy-share" v-model="dyAud.share" type="text" inputmode="decimal" placeholder="Ex.: 4,5">
          </div>
          <p class="err" role="alert">{{ dyAud.erro }}</p>
          <div class="row">
            <button class="btn" type="submit">Usar este público</button>
            <button class="btn ghost" type="button" @click="dyAud.open = false">Cancelar</button>
          </div>
        </form>
      </div>

      <div class="field">
        <label for="f-tr">Tráfego no experimento: {{ a.trafficPercent }}%</label>
        <p class="hint">Parte do público elegível que entra no teste. O resto fica livre para outros testes.</p>
        <input id="f-tr" v-model.number="a.trafficPercent" type="range" min="5" max="100" step="5" style="width: 100%; accent-color: var(--brand)">
      </div>

      <fieldset class="field">
        <legend>Divisão entre grupos (%)</legend>
        <div class="split">
          <label v-for="(g, i) in groups" :key="g">
            <span class="sub">{{ g }}</span>
            <input type="number" min="0" max="100" step="any" :value="splitPct(i)" @change="setSplit(i, +($event.target as HTMLInputElement).value)">
          </label>
        </div>
        <p v-if="splitSum !== 100" class="err">A divisão soma {{ splitSum.toLocaleString('pt-BR') }}%. Ajuste para 100%.</p>
      </fieldset>

      <div class="pair">
        <div class="field"><label for="f-st">Início</label><input id="f-st" v-model="a.startDate" type="date"></div>
        <div class="field"><label for="f-en">Fim</label><input id="f-en" v-model="a.endDate" type="date" :min="a.startDate || undefined"></div>
      </div>

      <section class="sugg" aria-labelledby="sugg-title" aria-live="polite">
        <div class="spread">
          <b id="sugg-title" class="small">Sugestão de datas</b>
          <button type="button" class="btn ghost small" :disabled="!canSuggest || dates.busy" @click="loadDates">{{ dates.busy ? 'Calculando…' : 'Sugerir datas' }}</button>
        </div>
        <p v-if="!canSuggest" class="small muted" style="margin: 6px 0 0">Escolha páginas e plataformas para sugerir o período.</p>
        <p v-else-if="dates.erro" class="err" role="alert">{{ dates.erro }}</p>
        <template v-else-if="dates.data">
          <p class="small" style="margin: 6px 0 0">
            <b>{{ fmtDate(dates.data.startDate) }} → {{ fmtDate(dates.data.endDate) }}</b> ({{ dates.data.days }} dias,
            {{ dates.data.basedOn === 'amostra' ? 'pela amostra necessária, em semanas inteiras' : 'mínimo de um ciclo semanal; escolha a NORTE para dimensionar pela amostra' }}).
            <button type="button" class="chip add" style="margin-left: 6px" @click="applyDates(dates.data!)">Usar</button>
          </p>
          <template v-if="dates.data.overlapping.length">
            <p class="small" style="margin: 8px 0 4px; color: var(--warn)"><b>Testes interpostos</b> nesse período, nas mesmas páginas e plataformas:</p>
            <ul class="small" style="margin: 0; padding-left: 18px">
              <li v-for="b in dates.data.overlapping" :key="b.faroId">{{ b.name }} · {{ fmtDate(b.startDate) }} → {{ fmtDate(b.endDate) }} <span class="muted">({{ b.faroId }})</span></li>
            </ul>
            <p v-if="dates.data.freeWindow" class="small" style="margin: 8px 0 0">
              Próxima janela livre: <b>{{ fmtDate(dates.data.freeWindow.startDate) }} → {{ fmtDate(dates.data.freeWindow.endDate) }}</b>
              <button type="button" class="chip add" style="margin-left: 6px" @click="applyDates(dates.data!.freeWindow!)">Usar janela livre</button>
            </p>
            <p v-else class="small muted" style="margin: 8px 0 0">Sem janela livre nos próximos meses: resolva na etapa de sobreposição.</p>
          </template>
          <p v-else class="small muted" style="margin: 6px 0 0">Nenhum teste interposto nesse período.</p>
        </template>
      </section>

      <button type="button" class="btn" style="width: 100%; margin-top: 10px" :disabled="!definicaoOk" @click="aba = 'alvo'">Montar o público-alvo →</button>
    </div>

    <div v-else class="grid2">
      <div class="panel">
        <h2>Público-alvo</h2>
        <p class="small muted" style="margin: 0 0 18px">
          Público: <b>{{ e.audience.description }}</b>
          <template v-if="e.audience.dyAttribute"> · atributo DY <code>{{ e.audience.dyAttribute }}</code></template>
        </p>

        <template v-if="temCodigo">
          <div v-for="p in paramList" :key="p.name" class="field param">
            <label :for="`f-alvo-param-${p.name}`">{{ p.label }}</label>
            <input
              :id="`f-alvo-param-${p.name}`"
              type="number"
              :min="p.min"
              :max="p.max"
              :step="p.type === 'integer' ? 1 : 'any'"
              :value="paramValues[p.name]"
              @change="setParam(p.name, ($event.target as HTMLInputElement).value)"
            >
            <p v-if="p.description || p.unit" class="hint">{{ p.description }}<span v-if="p.unit"> Em {{ p.unit }}.</span></p>
          </div>
          <div class="row" style="gap: 10px; flex-wrap: wrap">
            <button type="button" class="btn ghost" :disabled="seg.carregando" @click="puxarCodigo">Puxar código de segmentação</button>
            <button type="button" class="btn" :disabled="seg.carregando" @click="processar">{{ seg.carregando ? 'Processando…' : 'Processar estimativa no BigQuery' }}</button>
          </div>
          <p v-if="seg.erro" class="err" role="alert">{{ seg.erro }}</p>
          <p v-if="seg.clientes != null" class="callout okp" aria-live="polite">
            <b>{{ fmtInt(seg.clientes) }}</b> clientes no público ({{ seg.gigabytes.toLocaleString('pt-BR') }} GB processados).
          </p>
          <pre v-if="seg.sql" class="sqlbox"><code>{{ seg.sql }}</code></pre>
        </template>
        <template v-else>
          <p v-if="existingDy" class="callout warnp">
            Público já criado no DY (atributo <code>{{ existingDy }}</code>): o Faro usa o tamanho informado pelo time. A contagem real fica no console do DY.
          </p>
          <p v-else class="callout warnp">
            Este público não tem regra nem SQL versionado: a estimativa é do time (SEG-05). Informe a participação abaixo e registre o pedido de regra para a frente 3.
          </p>
          <div class="field" style="max-width: 280px">
            <label for="f-share">Tamanho estimado (% da base)</label>
            <input id="f-share" v-model.number="sharePct" type="number" min="0.1" max="100" step="any">
          </div>
        </template>
      </div>

      <div class="sticky">
        <section class="panel" aria-labelledby="est-title" aria-live="polite">
          <h2 id="est-title">Elegíveis</h2>
          <div class="stat"><span class="small muted">Usuários elegíveis por dia</span><b>{{ fmtInt(eligibleDaily) }}</b><span v-if="saveState === 'saving'" class="small muted">atualizando…</span></div>
          <div class="stat"><span class="small muted">Amostra por grupo</span><b>{{ nPerGroup ? fmtInt(nPerGroup) : '–' }}</b></div>
          <div class="stat"><span class="small muted">Amostra total ({{ groups.length }} grupos)</span><b>{{ duration?.totalSample ? fmtInt(duration.totalSample) : '–' }}</b></div>
          <div class="stat"><span class="small muted">Duração mínima</span><b>{{ duration?.durationDays ? `${duration.durationDays} dias` : '–' }}</b></div>
          <div v-for="al in duration?.alerts ?? []" :key="al.code" class="callout" :class="tone(al.level)">{{ al.message }}</div>
          <div v-if="duration && !duration.alerts.length && slack != null" class="callout okp">Cabe no período, com {{ slack }} dias de folga.</div>
          <ul v-if="failing.length" class="todo small">
            <li v-for="c in failing" :key="c.id">{{ c.message }}</li>
          </ul>
          <button type="button" class="btn ghost" style="width: 100%; margin-top: 16px" @click="aba = 'definicao'">← Voltar à definição</button>
          <button type="button" class="btn" style="width: 100%; margin-top: 8px" :disabled="!audience.every((c) => c.ok)" @click="emit('next')">Checar sobreposição</button>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.param { max-width: 320px; margin-top: 12px; }
.targets .trow { display: grid; grid-template-columns: 150px 1fr 1fr; gap: 8px; align-items: center; margin-top: 6px; }
.targets input { width: 100%; }
@media (max-width: 900px) { .targets .trow { grid-template-columns: 1fr; } }
.origin { margin-top: 8px; }
.origin .sub { margin-bottom: 4px; }
.dyform { border: 1px dashed var(--brand); border-radius: 14px; padding: 14px; margin-top: 10px; background: var(--brand-soft); }
.sugg { margin-top: 4px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.stat b { font-size: 22px; letter-spacing: -0.02em; }
.split { display: flex; gap: 12px; flex-wrap: wrap; }
.split label { display: flex; flex-direction: column; width: 140px; }
.todo { margin: 12px 0 0; padding-left: 18px; color: var(--warn); }
.sqlbox { margin-top: 14px; max-height: 320px; overflow: auto; background: var(--ink); color: var(--bg); border-radius: 12px; padding: 14px; font-size: 12.5px; line-height: 1.5; }
</style>
