<script setup lang="ts">
import type { Experiment, ExperimentHealth, MetricDefinition, SignificanceLabel } from '@faro/contracts';
import {
  CONTROL_KEY,
  PLATFORM_LABEL,
  SIGNIFICANCE_LABEL,
  formatDateTime,
  formatMetricValue,
  formatSignedPercent,
  type NorteRow,
} from '../../domain';

const props = defineProps<{
  experiment: Experiment;
  rows: NorteRow[];
  health?: ExperimentHealth;
  metric: (id: string) => MetricDefinition | undefined;
}>();

const SIG_TONE: Record<SignificanceLabel, string> = {
  melhora_confirmada: 'chip--ok',
  tendencia_de_melhora: 'chip--ok',
  sem_tendencia: 'chip--muted',
  tendencia_de_queda: 'chip--warn',
  queda_confirmada: 'chip--risk',
};

const norte = () => props.metric(props.experiment.design.primaryMetricId);
const fmt = (v: number | null) => formatMetricValue(v, norte()?.unit);
const armName = (key: string) =>
  key === CONTROL_KEY
    ? props.experiment.design.control.name
    : (props.experiment.design.variants.find((v) => v.key === key)?.name ?? key);
const platformLabel = (p: NorteRow['platform']) => (p === 'all' ? 'Consolidado' : PLATFORM_LABEL[p]);
</script>

<template>
  <section class="bloco" aria-labelledby="resultado-titulo">
    <h2 id="resultado-titulo">Resultado</h2>
    <p class="sub">
      Resumo da NORTE ({{ norte()?.name ?? experiment.design.primaryMetricId }}).
      <template v-if="health">Dados até {{ formatDateTime(health.asOf) }} (D-1).</template>
    </p>

    <p v-if="health?.unstableSplitDays" class="aviso" role="note">
      {{ health.unstableSplitDays }} dias com split instável nos últimos 90 dias.
    </p>

    <p v-if="rows.length === 0" class="vazio">
      Sem leitura ainda. Os números aparecem no dia seguinte à primeira exposição no DY.
    </p>

    <div v-else class="wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Plataforma</th>
            <th scope="col">Braço</th>
            <th scope="col">Valor</th>
            <th scope="col">Usuários</th>
            <th scope="col">Δ vs controle</th>
            <th scope="col">Chance de ser melhor</th>
            <th scope="col">Leitura</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.platform">
            <tr v-if="row.control">
              <th scope="row" :rowspan="1 + row.variants.length">{{ platformLabel(row.platform) }}</th>
              <td>{{ armName(CONTROL_KEY) }}</td>
              <td>{{ fmt(row.control.value) }}</td>
              <td>{{ row.control.n.toLocaleString('pt-BR') }}</td>
              <td colspan="3" class="muted">referência</td>
            </tr>
            <tr v-for="(v, i) in row.variants" :key="v.variantKey">
              <th v-if="!row.control && i === 0" scope="row" :rowspan="row.variants.length">
                {{ platformLabel(row.platform) }}
              </th>
              <td>{{ armName(v.variantKey) }}</td>
              <td>{{ fmt(v.value) }}</td>
              <td>{{ v.n.toLocaleString('pt-BR') }}</td>
              <td>{{ v.deltaRelative === undefined ? '—' : formatSignedPercent(v.deltaRelative) }}</td>
              <td>{{ v.probBetter === undefined ? '—' : `${Math.round(v.probBetter * 100)}%` }}</td>
              <td>
                <span v-if="v.label" class="chip" :class="SIG_TONE[v.label]">{{
                  SIGNIFICANCE_LABEL[v.label]
                }}</span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <p class="nota">
      Usuários que viram mais de uma variante ficam fora da leitura. O relatório completo, com métricas
      secundárias e GUARDA, é da tela de resultados (frente 4).
    </p>
  </section>
</template>

<style scoped>
.bloco {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
}
h2 {
  margin: 0;
  font-size: 18px;
}
.sub,
.nota {
  color: var(--muted);
  font-size: 13.5px;
  margin: 2px 0 12px;
}
.nota {
  margin: 12px 0 0;
}
.aviso {
  background: var(--warn-soft);
  color: var(--warn);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 0 0 12px;
}
.vazio {
  color: var(--muted);
  margin: 0;
}
.wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
  font-size: 14px;
}
th,
td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
thead th {
  font-size: 12.5px;
  color: var(--muted);
  font-weight: 600;
}
tbody th {
  font-weight: 600;
}
.muted {
  color: var(--muted);
}
</style>
