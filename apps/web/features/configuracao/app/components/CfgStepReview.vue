<script setup lang="ts">
// Etapa 4 — Revisão, ficha do DY e confirmação (CFG-11, CFG-12, CFG-13).
import type { DySheet } from '@faro/contracts';
import { ApiError, useFaroApi, type FaroEventRow } from '../composables/useFaroApi';
import { useExperimentDraft } from '../composables/useExperimentDraft';
import { PLATFORM_LABEL, fmtDate, fmtInt, fmtPct } from '../utils/labels';

const emit = defineEmits<{ edit: [] }>();
const api = useFaroApi();
const { experiment: exp, catalog, pageCatalog, others, eligibleDaily, nPerGroup, duration, markReady, confirm, setCampaignType } = useExperimentDraft();
const e = computed(() => exp.value!);
const d = computed(() => e.value.design);
const platformName = (p: keyof typeof PLATFORM_LABEL) => PLATFORM_LABEL[p];
const metricName = (id: string) => catalog.value.find((m) => m.id === id)?.name ?? id;
const pageName = (id: string) => pageCatalog.value?.pages.find((p) => p.id === id)?.name ?? id;
const otherName = (id: string) => others.value.find((o) => o.faroId === id)?.name ?? id;
const RES = { exclusao_mutua: 'Exclusão mútua', paralelo: 'Rodar em paralelo', reagendar: 'Reagendar' } as const;

const preDy = computed(() => ['rascunho', 'design_completo'].includes(e.value.status));
const sheet = ref<DySheet | null>(null);
const divergences = ref<FaroEventRow[]>([]);
const error = ref('');
const busy = ref(false);

async function loadSheet() {
  if (preDy.value) return;
  sheet.value = await api.sheet(e.value.faroId);
  divergences.value = (await api.events(e.value.faroId)).filter((x) => x.type === 'experiment.config_divergence');
}
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

// Confirmação (CFG-12)
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
        <dt>Onde</dt><dd>{{ e.allocation.pages.map(pageName).join(', ') }} em {{ e.allocation.platforms.map(platformName).join(', ') }}</dd>
        <dt>Público</dt><dd>{{ e.audience.description }} (~{{ fmtPct(e.audience.estimatedShare ?? 1, 0) }} da base), {{ e.allocation.trafficPercent }}% do tráfego, divisão {{ e.allocation.split.map((s) => fmtPct(s, 0)).join(' × ') }}</dd>
        <dt>Período</dt><dd>{{ fmtDate(e.allocation.startDate) }} a {{ fmtDate(e.allocation.endDate) }} · ~{{ fmtInt(eligibleDaily) }} usuários/dia · {{ nPerGroup ? fmtInt(nPerGroup) : '–' }} por grupo · mínimo de {{ duration?.durationDays ?? '–' }} dias</dd>
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

      <div class="panel"><CfgDySheet :sheet="sheet" :markdown-url="api.sheetMarkdownUrl(e.faroId)" /></div>

      <section v-if="e.status === 'pronto_para_configurar'" class="panel" aria-labelledby="conf-title">
        <h2 id="conf-title">Confirmar configuração no DY</h2>
        <p class="small muted">Depois de criar a campanha no console, cole o ID dela aqui. O status muda para configurado no DY e o Faro passa a checar a campanha todo dia.</p>
        <form class="pair" @submit.prevent="submitConfirm">
          <div class="field"><label for="c-id">ID da campanha no DY</label><input id="c-id" v-model="form.campaignId" type="text" autocomplete="off" aria-describedby="c-err"></div>
          <div class="field"><label for="c-by">Quem configurou</label><input id="c-by" v-model="form.configuredBy" type="email"></div>
          <div class="field"><label for="c-at">Quando</label><input id="c-at" v-model="form.configuredAt" type="datetime-local"></div>
          <div class="field" style="align-self: end"><button class="btn" type="submit">Confirmar configuração</button></div>
        </form>
        <p id="c-err" class="err" role="alert">{{ formErr }}</p>
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
.stack { display: flex; flex-direction: column; gap: 18px; }
dl.sum { display: grid; grid-template-columns: 180px 1fr; gap: 10px 18px; margin: 0; }
dl.sum dt { color: var(--muted); font-weight: 600; }
dl.sum dd { margin: 0; }
@media (max-width: 900px) { dl.sum { grid-template-columns: 1fr; } dl.sum dd { margin-bottom: 8px; } }
</style>
