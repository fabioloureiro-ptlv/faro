<script setup lang="ts">
// Etapa 4 — Revisão, ficha do DY e confirmação (CFG-11, CFG-12, CFG-13).
import type { DySheet } from '@faro/contracts';
import { pageLine } from '@faro/config-core';
import { ApiError, useFaroApi, type AnuncioResult, type FaroEventRow } from '../composables/useFaroApi';
import { useExperimentDraft } from '../composables/useExperimentDraft';
import { PLATFORM_LABEL, fmtDate, fmtInt, fmtPct } from '../utils/labels';

const emit = defineEmits<{ edit: [] }>();
const api = useFaroApi();
const { experiment: exp, catalog, pageCatalog, others, dailyEstimate, sample, markReady, confirm, setCampaignType } = useExperimentDraft();
const e = computed(() => exp.value!);
const d = computed(() => e.value.design);
const platformName = (p: keyof typeof PLATFORM_LABEL) => PLATFORM_LABEL[p];
const metricName = (id: string) => catalog.value.find((m) => m.id === id)?.name ?? id;
const pageName = (id: string) => pageCatalog.value?.pages.find((p) => p.id === id)?.name ?? id;
const pageLabel = (id: string) => pageLine(id, pageName(id), e.value.allocation.pageTargets);
const otherName = (id: string) => others.value.find((o) => o.faroId === id)?.name ?? id;
const RES = { exclusao_mutua: 'Exclusão mútua', paralelo: 'Rodar em paralelo', reagendar: 'Reagendar' } as const;

const preDy = computed(() => ['rascunho', 'design_completo'].includes(e.value.status));
const sheet = ref<DySheet | null>(null);
const divergences = ref<FaroEventRow[]>([]);
const error = ref('');
const busy = ref(false);

// Aviso ao time (Slack + card no Jira): o último evento `experiment.announced` diz se já foi feito e qual card.
const announced = ref<FaroEventRow | null>(null);
const anuncio = ref<AnuncioResult | null>(null);
const anuncioErr = ref('');
const anuncioBusy = ref(false);

async function loadSheet() {
  if (preDy.value) return;
  sheet.value = await api.sheet(e.value.faroId);
  const events = await api.events(e.value.faroId);
  divergences.value = events.filter((x) => x.type === 'experiment.config_divergence');
  announced.value = events.filter((x) => x.type === 'experiment.announced').at(-1) ?? null;
}

async function anunciar() {
  anuncioBusy.value = true;
  anuncioErr.value = '';
  try {
    anuncio.value = await api.anunciar(e.value.faroId);
    if (anuncio.value.slack.status === 'enviado') phase.copied = true;
    await loadSheet();
  } catch (err) {
    anuncioErr.value = err instanceof ApiError ? err.message : 'Falha ao avisar o time.';
  } finally {
    anuncioBusy.value = false;
  }
}
const DESTINO = { enviado: 'enviado', nao_configurado: 'não configurado na API', falhou: 'falhou, tente de novo' } as const;
onMounted(loadSheet);

async function finish() {
  busy.value = true;
  error.value = '';
  try {
    await markReady();
    await loadSheet();
  } catch (err) {
    error.value = err instanceof ApiError ? [err.message, ...(err.body.details ?? []).map((x) => x.message)].filter(Boolean).join(' ') : 'Falha ao finalizar.';
  } finally {
    busy.value = false;
  }
}
async function changeType(t: 'custom_code' | 'api_custom' | 'recommendation') {
  await setCampaignType(t);
  await loadSheet();
}

// Confirmação (CFG-12), faseada (ajuste 15/10): 1) copiar a ficha, 2) colar no console
// e criar a campanha, 3) só então confirmar com o ID. O progresso fica no navegador.
const phase = reactive({ copied: false, pasted: false });
const phaseKey = () => `faro:dy-phase:${e.value.faroId}`;
onMounted(() => {
  try {
    const raw = localStorage.getItem(phaseKey());
    if (raw) Object.assign(phase, JSON.parse(raw) as Partial<typeof phase>);
  } catch {
    /* sem storage: fases só nesta sessão */
  }
});
watch(phase, () => {
  try {
    localStorage.setItem(phaseKey(), JSON.stringify(phase));
  } catch {
    /* idem */
  }
});
const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const form = reactive({ campaignId: '', configuredBy: api.actor, configuredAt: nowLocal() });
const formErr = ref('');
async function submitConfirm() {
  formErr.value = '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(form.campaignId.trim())) return (formErr.value = 'Cole o ID da campanha do DY (só letras, números, - e _).');
  if (form.configuredBy.trim().length < 3) return (formErr.value = 'Informe quem configurou.');
  try {
    await confirm({ campaignId: form.campaignId.trim(), configuredBy: form.configuredBy.trim(), configuredAt: new Date(form.configuredAt).toISOString() });
    await loadSheet();
  } catch (err) {
    formErr.value = err instanceof ApiError ? err.message : 'Falha ao confirmar.';
  }
}
</script>

<template>
  <div class="stack">
    <section class="panel">
      <h2>{{ e.name }}</h2>
      <p class="small muted" style="margin: 0 0 20px">{{ e.faroId }} · Confira antes de gerar a ficha. O design fica anexado ao teste e aparece no relatório.</p>
      <dl class="sum">
        <dt>Contexto</dt><dd>{{ d.context }}</dd>
        <dt>Hipótese</dt><dd>Se {{ d.hypothesis.change }}, então {{ d.hypothesis.expectedEffect }}, porque {{ d.hypothesis.because }}.</dd>
        <dt>Controle</dt><dd>{{ d.control.description }} <a v-if="d.control.figmaUrl" :href="d.control.figmaUrl" target="_blank" rel="noopener">Figma do antes</a></dd>
        <template v-for="v in d.variants" :key="v.key">
          <dt>{{ v.name }}</dt><dd>{{ v.description }} <a v-if="v.figmaUrl" :href="v.figmaUrl" target="_blank" rel="noopener">Figma do depois</a></dd>
        </template>
        <dt>Métrica primária</dt>
        <dd>{{ metricName(d.primaryMetricId) }} · efeito mínimo de {{ fmtPct(d.mdeRelative) }}<span v-if="d.baselineOverride"> · linha de base ajustada para {{ d.baselineOverride }}</span></dd>
        <dt>Secundárias</dt><dd>{{ d.secondaryMetricIds.map(metricName).join(', ') }}</dd>
        <dt>Guardrails</dt><dd>{{ d.guardrailMetricIds.length ? d.guardrailMetricIds.map(metricName).join(', ') : 'Nenhum' }}</dd>
        <dt>Onde</dt>
        <dd>
          <div v-for="id in e.allocation.pages" :key="id">{{ pageLabel(id) }}</div>
          <div class="small muted">em {{ e.allocation.platforms.map(platformName).join(', ') }}</div>
        </dd>
        <dt>Público</dt><dd>{{ e.audience.description }}<template v-if="e.audience.params && Object.keys(e.audience.params).length"> ({{ Object.entries(e.audience.params).map(([k, v]) => `${k} = ${v}`).join(', ') }})</template> (~{{ fmtPct(e.audience.estimatedShare ?? 1, 0) }} da base), {{ e.allocation.trafficPercent }}% do tráfego, divisão {{ e.allocation.split.map((s) => fmtPct(s, 0)).join(' × ') }}</dd>
        <dt>Período</dt><dd>{{ fmtDate(e.allocation.startDate) }} a {{ fmtDate(e.allocation.endDate) }} · amostra total {{ sample ? fmtInt(sample.total) : '–' }} ({{ sample ? sample.perGroup.map((g) => fmtInt(g.size)).join(' / ') : '–' }} por grupo, {{ sample ? sample.trafficPercent : e.allocation.trafficPercent }}% do público) · ~{{ dailyEstimate ? fmtInt(dailyEstimate) : '–' }} usuários/dia (estimativa)</dd>
        <dt>Sobreposição</dt>
        <dd>
          <template v-if="e.overlap?.length">
            <div v-for="o in e.overlap" :key="o.otherFaroId">{{ otherName(o.otherFaroId) }}: {{ o.resolution ? RES[o.resolution] : 'sem ação (risco baixo)' }}</div>
          </template>
          <template v-else>Nenhuma</template>
        </dd>
      </dl>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <div v-if="preDy" class="row" style="margin-top: 24px">
        <button type="button" class="btn" :disabled="busy" @click="finish">Finalizar revisão e gerar ficha do DY</button>
        <button type="button" class="btn ghost" @click="emit('edit')">Editar design</button>
      </div>
    </section>

    <template v-if="sheet">
      <section v-if="e.status === 'pronto_para_configurar'" class="panel">
        <label for="f-type" class="sub">Tipo de campanha no DY</label>
        <select id="f-type" :value="e.dy?.campaignType" style="max-width: 280px" @change="changeType(($event.target as HTMLSelectElement).value as 'custom_code')">
          <option value="custom_code">Custom Code</option>
          <option value="api_custom">API Custom</option>
          <option value="recommendation">Recomendação</option>
        </select>
      </section>

      <div class="panel"><CfgDySheet :sheet="sheet" :markdown-url="api.sheetMarkdownUrl(e.faroId)" @exported="phase.copied = true" /></div>

      <section class="panel" aria-labelledby="aviso-title">
        <div class="spread">
          <div>
            <h2 id="aviso-title">Avisar o time</h2>
            <p class="small muted" style="margin: 0">
              Manda o resumo do teste para o canal do Slack e abre um card no Jira com a ficha acima, para quem configura o DY.
              O DY não tem API para criar a campanha: esse card é o pedido.
            </p>
          </div>
          <!-- Integração Slack/Jira ainda sem credenciais no ambiente: botão desativado até a configuração. -->
          <div style="display: flex; align-items: center; gap: 10px">
            <button type="button" class="btn" disabled>
              {{ anuncioBusy ? 'Enviando…' : announced ? 'Avisar de novo' : 'Enviar para o Slack e abrir card no Jira' }}
            </button>
            <span class="small muted">Em configuração</span>
          </div>
        </div>
        <p v-if="anuncioErr" class="err" role="alert">{{ anuncioErr }}</p>
        <p v-if="anuncio" class="small" role="status" style="margin: 10px 0 0">
          Slack: {{ DESTINO[anuncio.slack.status] }}<template v-if="anuncio.slack.channel"> em {{ anuncio.slack.channel }}</template>
          · Jira: {{ DESTINO[anuncio.jira.status] }}<template v-if="anuncio.jira.url"> — <a :href="anuncio.jira.url" target="_blank" rel="noopener">{{ anuncio.jira.key }}</a></template>
        </p>
        <p v-else-if="announced" class="small muted" style="margin: 10px 0 0">
          Avisado em {{ fmtDate(announced.occurredAt) }}<template v-if="announced.payload.jira"> · card <a :href="announced.payload.jira.url" target="_blank" rel="noopener">{{ announced.payload.jira.key }}</a></template>.
        </p>
        <details v-if="anuncio" class="small" style="margin-top: 8px">
          <summary class="muted">Ver a mensagem enviada</summary>
          <pre class="msg">{{ anuncio.texto }}</pre>
        </details>
      </section>

      <section v-if="e.status === 'pronto_para_configurar'" class="panel" aria-labelledby="conf-title">
        <h2 id="conf-title">Confirmar configuração no DY</h2>
        <p class="small muted">Em três passos: copie a ficha, cole no console do DY e só então confirme com o ID da campanha. O status muda para configurado no DY e o Faro passa a checar a campanha todo dia.</p>
        <ol class="phases">
          <li :class="{ done: phase.copied }">
            <span class="n" aria-hidden="true">1</span>
            <div>
              <b>Copiar a ficha</b>
              <span class="small muted">Use “Copiar tudo” ou “Exportar Markdown” na ficha acima.</span>
              <span class="visually-hidden">{{ phase.copied ? 'concluído' : 'pendente' }}</span>
            </div>
          </li>
          <li :class="{ done: phase.pasted, locked: !phase.copied }">
            <span class="n" aria-hidden="true">2</span>
            <div>
              <b>Colar no console do DY e criar a campanha</b>
              <label class="small check"><input v-model="phase.pasted" type="checkbox" :disabled="!phase.copied"> Já colei a ficha e a campanha existe no DY</label>
              <span v-if="!phase.copied" class="small muted">Libera depois de copiar a ficha.</span>
            </div>
          </li>
          <li :class="{ locked: !phase.pasted }">
            <span class="n" aria-hidden="true">3</span>
            <div style="flex: 1">
              <b>Confirmar com o ID da campanha</b>
              <form v-if="phase.pasted" class="pair" style="margin-top: 8px" @submit.prevent="submitConfirm">
                <div class="field"><label for="c-id">ID da campanha no DY</label><input id="c-id" v-model="form.campaignId" type="text" autocomplete="off" aria-describedby="c-err"></div>
                <div class="field"><label for="c-by">Quem configurou</label><input id="c-by" v-model="form.configuredBy" type="email"></div>
                <div class="field"><label for="c-at">Quando</label><input id="c-at" v-model="form.configuredAt" type="datetime-local"></div>
                <div class="field" style="align-self: end"><button class="btn" type="submit">Confirmar configuração</button></div>
              </form>
              <span v-else class="small muted">Libera depois do passo 2.</span>
              <p id="c-err" class="err" role="alert">{{ formErr }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section v-else class="panel">
        <h2>Configurado no DY</h2>
        <p class="small" style="margin: 0">
          Campanha <b>{{ e.dy?.campaignId }}</b> configurada por {{ e.dy?.configuredBy }} em {{ fmtDate(e.dy?.configuredAt ?? '') }}.
          Mudanças de design a partir daqui ficam registradas na auditoria.
        </p>
        <div v-if="divergences.length" class="callout riskp" role="status">
          <b>Divergências na checagem D+1</b>
          <ul style="margin: 6px 0 0; padding-left: 18px">
            <li v-for="dv in divergences.flatMap((x) => x.payload.divergences ?? [])" :key="dv.refdate + dv.message">{{ fmtDate(dv.refdate) }}: {{ dv.message }}</li>
          </ul>
        </div>
        <p v-else class="small muted" style="margin: 8px 0 0">Nenhuma divergência entre o planejado e o export do DY até agora.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.msg { white-space: pre-wrap; font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin: 8px 0 0; }
.stack { display: flex; flex-direction: column; gap: 18px; }
.phases { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.phases li { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.phases li > div { display: flex; flex-direction: column; gap: 4px; }
.phases .n { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; background: var(--line); color: var(--ink); }
.phases li.done { border-color: var(--ok); }
.phases li.done .n { background: var(--ok); color: #fff; }
.phases li.locked { opacity: 0.6; }
.check { display: flex; gap: 8px; align-items: center; cursor: pointer; }
.check input { accent-color: var(--brand); }
dl.sum { display: grid; grid-template-columns: 180px 1fr; gap: 10px 18px; margin: 0; }
dl.sum dt { color: var(--muted); font-weight: 600; }
dl.sum dd { margin: 0; }
@media (max-width: 900px) { dl.sum { grid-template-columns: 1fr; } dl.sum dd { margin-bottom: 8px; } }
</style>
