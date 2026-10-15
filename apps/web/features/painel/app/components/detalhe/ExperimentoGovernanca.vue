<script setup lang="ts">
import type { GovernanceAlert, OverlapDecision } from '@faro/contracts';
import {
  ALERT_RULE_LABEL,
  ALERT_SEVERITY_LABEL,
  BU_LABEL,
  OVERLAP_LABEL,
  STATUS_LABEL,
  type RelatedExperiment,
} from '../../domain';

const props = defineProps<{
  alerts: GovernanceAlert[];
  overlap: OverlapDecision[];
  related: RelatedExperiment[];
}>();

const ALERT_TONE: Record<GovernanceAlert['severity'], string> = {
  info: 'chip--muted',
  atencao: 'chip--warn',
  critico: 'chip--risk',
};
const OVERLAP_TONE = { baixo: 'chip--muted', medio: 'chip--warn', alto: 'chip--risk' } as const;
const RESOLUTION_LABEL: Record<NonNullable<OverlapDecision['resolution']>, string> = {
  exclusao_mutua: 'Exclusão mútua',
  paralelo: 'Rodam em paralelo',
  reagendar: 'Reagendar',
};
const relatedOf = (id: string) => props.related.find((r) => r.faroId === id);
</script>

<template>
  <section class="bloco" aria-labelledby="gov-titulo">
    <h2 id="gov-titulo">Governança</h2>

    <h3>Alertas</h3>
    <p v-if="alerts.length === 0" class="vazio">Nenhum alerta aberto.</p>
    <ul v-else class="lista">
      <li v-for="a in alerts" :key="a.id">
        <span class="chip" :class="ALERT_TONE[a.severity]">{{ ALERT_SEVERITY_LABEL[a.severity] }}</span>
        <div>
          <strong>{{ ALERT_RULE_LABEL[a.rule] }}</strong>
          <p>{{ a.message }}</p>
          <small>Ação sugerida: {{ a.suggestedAction }} · Dono: {{ a.owner }}</small>
        </div>
      </li>
    </ul>

    <h3>Sobreposições</h3>
    <p v-if="overlap.length === 0" class="vazio">Nenhuma sobreposição detectada.</p>
    <ul v-else class="lista">
      <li v-for="o in overlap" :key="o.otherFaroId">
        <span class="chip" :class="OVERLAP_TONE[o.severity]">{{ OVERLAP_LABEL[o.severity] }}</span>
        <div>
          <NuxtLink :to="`/painel/${o.otherFaroId}`">
            {{ relatedOf(o.otherFaroId)?.name ?? o.otherFaroId }}
          </NuxtLink>
          <small v-if="relatedOf(o.otherFaroId)">
            {{ o.otherFaroId }} · {{ BU_LABEL[relatedOf(o.otherFaroId)!.bu] }} ·
            {{ STATUS_LABEL[relatedOf(o.otherFaroId)!.status] }}
          </small>
          <p>
            ~{{ o.estimatedDailyUsers.toLocaleString('pt-BR') }} usuários/dia nos dois testes ·
            <strong v-if="o.resolution">{{ RESOLUTION_LABEL[o.resolution] }}</strong>
            <strong v-else class="risco">sem decisão</strong>
          </p>
        </div>
      </li>
    </ul>
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
  margin: 0 0 4px;
  font-size: 18px;
}
h3 {
  margin: 14px 0 6px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.vazio {
  color: var(--muted);
  margin: 0;
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lista li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.lista p {
  margin: 2px 0;
}
.lista small {
  display: block;
  color: var(--muted);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
.lista a {
  color: var(--brand);
  font-weight: 600;
}
.risco {
  color: var(--risk);
}
</style>
