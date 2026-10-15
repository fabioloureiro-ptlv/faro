<script setup lang="ts">
import type { Experiment } from '@faro/contracts';
import { OUTCOME_LABEL, formatDateTime, type HeaderTag, type TagTone } from '../../domain';

defineProps<{ experiment: Experiment; tags: HeaderTag[] }>();

const TONE: Record<TagTone, string> = { neutral: '', ok: 'chip--ok', warn: 'chip--warn', risk: 'chip--risk' };
</script>

<template>
  <header class="cab">
    <NuxtLink to="/painel" class="voltar">← Experimentos</NuxtLink>
    <h1>
      {{ experiment.name }}
      <span v-if="experiment.legacy" class="chip chip--warn">Legado</span>
    </h1>
    <p class="meta">
      {{ experiment.faroId }} · {{ experiment.ownerSquad }} · {{ experiment.ownerEmail }}
      <template v-if="experiment.dy"> · DY: {{ experiment.dy.campaignName }}</template>
    </p>

    <dl class="tags">
      <div v-for="t in tags" :key="t.label" class="tag">
        <dt>{{ t.label }}</dt>
        <dd>
          <span class="chip" :class="TONE[t.tone]">{{ t.value }}</span>
        </dd>
      </div>
    </dl>

    <section v-if="experiment.decision" class="decisao" aria-label="Decisão">
      <strong>Decisão: {{ OUTCOME_LABEL[experiment.decision.outcome] }}</strong>
      <p>{{ experiment.decision.rationale }}</p>
      <small>{{ experiment.decision.decidedBy }} · {{ formatDateTime(experiment.decision.decidedAt) }}</small>
    </section>
  </header>
</template>

<style scoped>
.voltar {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
  font-size: 14px;
}
h1 {
  margin: 8px 0 2px;
  font-size: 26px;
  letter-spacing: -0.01em;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.meta {
  margin: 0 0 16px;
  color: var(--muted);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin: 0 0 16px;
}
.tag {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
dt {
  font-size: 12px;
  color: var(--muted);
}
dd {
  margin: 0;
}
dd .chip {
  white-space: normal;
}
.decisao {
  border: 1px solid var(--line);
  border-left: 4px solid var(--ok);
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.decisao p {
  margin: 4px 0;
}
.decisao small {
  color: var(--muted);
}
</style>
