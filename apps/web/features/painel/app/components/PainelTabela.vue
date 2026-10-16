<script setup lang="ts">
import type { GovernanceAlert, MetricResult, SignificanceLabel } from '@faro/contracts';
import {
  ALERT_RULE_LABEL,
  ALERT_SEVERITY_LABEL,
  BU_LABEL,
  OVERLAP_LABEL,
  PLATFORM_LABEL,
  SIGNIFICANCE_LABEL,
  STATUS_LABEL,
  formatDayMonth,
  formatSignedPercent,
  worstAlert,
  worstOverlap,
  type PainelFilters,
  type PainelRow,
  type SortKey,
} from '../domain';

const props = defineProps<{
  rows: PainelRow[];
  filters: PainelFilters;
  pageName: (id: string) => string;
  metricName: (id: string) => string;
}>();

const emit = defineEmits<{ sort: [key: SortKey] }>();

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'nome', label: 'Experimento' },
  { key: 'status', label: 'Status' },
  { key: 'onde', label: 'Onde' },
  { key: 'publico', label: 'Público' },
  { key: 'norte', label: 'Métrica principal' },
  { key: 'periodo', label: 'Período' },
  { key: 'sobreposicao', label: 'Sobreposição' },
  { key: 'alertas', label: 'Alertas' },
];

function ariaSort(key: SortKey) {
  if (props.filters.sort !== key) return 'none';
  return props.filters.dir === 'asc' ? 'ascending' : 'descending';
}

const SIG_TONE: Record<SignificanceLabel, string> = {
  melhora_confirmada: 'chip--ok',
  tendencia_de_melhora: 'chip--ok',
  sem_tendencia: 'chip--muted',
  tendencia_de_queda: 'chip--warn',
  queda_confirmada: 'chip--risk',
};
const ALERT_TONE: Record<GovernanceAlert['severity'], string> = {
  info: 'chip--muted',
  atencao: 'chip--warn',
  critico: 'chip--risk',
};
const OVERLAP_TONE = { baixo: 'chip--muted', medio: 'chip--warn', alto: 'chip--risk' } as const;

const probText = (n: MetricResult) =>
  n.probBetter === undefined ? '' : `${Math.round(n.probBetter * 100)}%`;

// Helpers fora do template: o vue-tsc desta versão gera unref() para constantes
// usadas dentro de arrow functions inline e acusa `.value` inexistente.
const platformNames = (r: PainelRow) =>
  r.experiment.allocation.platforms.map((p) => PLATFORM_LABEL[p]).join(' · ');
const alertRules = (r: PainelRow) => r.alerts.map((a) => ALERT_RULE_LABEL[a.rule]).join(' · ');
const unresolved = (r: PainelRow) => (r.experiment.overlap ?? []).filter((o) => !o.resolution).length;
const alertSummary = (r: PainelRow) =>
  r.alerts.map((a) => `${ALERT_RULE_LABEL[a.rule]}: ${a.message}`).join('\n');
</script>

<template>
  <div class="wrap">
    <table>
      <thead>
        <tr>
          <th v-for="c in COLUMNS" :key="c.key" scope="col" :aria-sort="ariaSort(c.key)">
            <button type="button" @click="emit('sort', c.key)">
              {{ c.label }}
              <span aria-hidden="true" class="seta">{{
                filters.sort === c.key ? (filters.dir === 'asc' ? '▲' : '▼') : '↕'
              }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.experiment.faroId">
          <td class="exp">
            <NuxtLink :to="`/painel/${r.experiment.faroId}`" class="nome">{{ r.experiment.name }}</NuxtLink>
            <span v-if="r.experiment.legacy" class="chip chip--warn">Legado</span>
            <small>{{ r.experiment.faroId }} · {{ BU_LABEL[r.experiment.bu] }} ·
              {{ r.experiment.ownerSquad }}</small>
          </td>
          <td>
            <span class="chip">{{ STATUS_LABEL[r.experiment.status] }}</span>
          </td>
          <td>
            {{ r.experiment.allocation.pages.map(pageName).join(', ') }}
            <small>{{ platformNames(r) }}</small>
          </td>
          <td>
            {{ r.experiment.audience.description }}
            <small v-if="r.experiment.audience.estimatedShare !== undefined">
              {{ Math.round(r.experiment.audience.estimatedShare * 100) }}% da base ·
              {{ r.experiment.allocation.trafficPercent }}% no teste
            </small>
          </td>
          <td class="norte">
            {{ metricName(r.experiment.design.primaryMetricId) }}
            <template v-if="r.norte?.label">
              <span class="chip" :class="SIG_TONE[r.norte.label]">{{
                SIGNIFICANCE_LABEL[r.norte.label]
              }}</span>
              <small>
                <template v-if="r.norte.deltaRelative !== undefined">{{ formatSignedPercent(r.norte.deltaRelative) }} ·
                </template>
                chance de ser melhor {{ probText(r.norte) }}
              </small>
            </template>
            <small v-else>Sem leitura ainda</small>
          </td>
          <td class="periodo">
            {{ formatDayMonth(r.experiment.allocation.startDate) }} →
            {{ formatDayMonth(r.experiment.allocation.endDate) }}
          </td>
          <td>
            <template v-if="worstOverlap(r)">
              <span class="chip" :class="OVERLAP_TONE[worstOverlap(r)!]">
                {{ r.experiment.overlap!.length }} · {{ OVERLAP_LABEL[worstOverlap(r)!] }}
              </span>
              <small v-if="unresolved(r)" class="risco">{{ unresolved(r) }} sem decisão</small>
            </template>
            <span v-else class="vazio">—</span>
          </td>
          <td>
            <template v-if="worstAlert(r)">
              <span class="chip" :class="ALERT_TONE[worstAlert(r)!]" :title="alertSummary(r)">
                {{ r.alerts.length }} · {{ ALERT_SEVERITY_LABEL[worstAlert(r)!] }}
              </span>
              <small>{{ alertRules(r) }}</small>
            </template>
            <span v-else class="vazio">—</span>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="COLUMNS.length" class="nada">Nenhum teste com esses filtros.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.wrap {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1080px;
}
th {
  text-align: left;
  font-size: 12.5px;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  padding: 0;
  white-space: nowrap;
}
th button {
  border: 0;
  background: none;
  font-weight: 600;
  padding: 10px 12px;
  cursor: pointer;
  color: inherit;
  display: inline-flex;
  gap: 4px;
}
th[aria-sort='ascending'] button,
th[aria-sort='descending'] button {
  color: var(--brand);
}
.seta {
  font-size: 10px;
}
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  font-size: 14px;
}
tbody tr:last-child td {
  border-bottom: 0;
}
td small {
  display: block;
  color: var(--muted);
  font-size: 12.5px;
  margin-top: 2px;
}
.nome {
  margin-right: 6px;
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
}
.nome:hover {
  color: var(--brand);
  text-decoration: underline;
}
.norte .chip {
  margin-top: 4px;
}
.periodo {
  white-space: nowrap;
}
.risco {
  color: var(--risk);
}
.vazio {
  color: var(--muted);
}
.nada {
  text-align: center;
  color: var(--muted);
  padding: 32px;
}
</style>
