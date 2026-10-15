<script setup lang="ts">
import type { Experiment, MetricDefinition } from '@faro/contracts';
import { fieldLabel } from '../../domain';

const props = defineProps<{
  experiment: Experiment;
  missing: string[];
  metric: (id: string) => MetricDefinition | undefined;
}>();

const NOT_RECORDED = '[não registrado]';
const or = (s: string) => (s.trim() ? s : NOT_RECORDED);
// Meio de frase ("Se substituir…"). Preserva siglas ("DY", "SAC"): não baixa se a 2ª letra for maiúscula.
const mid = (s: string) => {
  const t = or(s);
  return /^\p{Lu}(?!\p{Lu})/u.test(t) ? t.charAt(0).toLocaleLowerCase('pt-BR') + t.slice(1) : t;
};
const metricName = (id: string) => props.metric(id)?.name ?? id;

// Defesa extra além do contrato (HttpsUrlSchema): só https vira link.
const safeHref = (url?: string) => (url && url.startsWith('https://') ? url : undefined);
</script>

<template>
  <section class="bloco" aria-labelledby="design-titulo">
    <h2 id="design-titulo">Design</h2>

    <p v-if="missing.length" class="aviso" role="note">
      <strong>{{ experiment.legacy ? 'Teste legado importado do DY.' : 'Design incompleto.' }}</strong>
      Falta registrar: {{ missing.map(fieldLabel).join(', ') }}.
    </p>

    <h3>Contexto</h3>
    <p>{{ or(experiment.design.context) }}</p>

    <h3>Hipótese</h3>
    <p class="hipotese">
      <span>Se</span> {{ mid(experiment.design.hypothesis.change) }}, <span>então</span>
      {{ mid(experiment.design.hypothesis.expectedEffect) }}, <span>porque</span>
      {{ mid(experiment.design.hypothesis.because) }}.
    </p>

    <h3>O que muda</h3>
    <div class="bracos">
      <article class="braco">
        <small>Controle</small>
        <strong>{{ experiment.design.control.name }}</strong>
        <p>{{ or(experiment.design.control.description) }}</p>
        <a
          v-if="safeHref(experiment.design.control.figmaUrl)"
          :href="safeHref(experiment.design.control.figmaUrl)"
          target="_blank"
          rel="noopener noreferrer"
        >Figma do antes ↗</a>
      </article>
      <article v-for="v in experiment.design.variants" :key="v.key" class="braco">
        <small>Variante</small>
        <strong>{{ v.name }}</strong>
        <p>{{ or(v.description) }}</p>
        <a v-if="safeHref(v.figmaUrl)" :href="safeHref(v.figmaUrl)" target="_blank" rel="noopener noreferrer">Figma do depois ↗</a>
      </article>
    </div>

    <h3>Métricas</h3>
    <ul class="metricas">
      <li>
        <span class="chip chip--ok">NORTE</span> {{ metricName(experiment.design.primaryMetricId) }}
        <small>MDE {{ Math.round(experiment.design.mdeRelative * 100) }}%</small>
      </li>
      <li v-for="id in experiment.design.secondaryMetricIds" :key="id">
        <span class="chip chip--muted">Secundária</span> {{ metricName(id) }}
      </li>
      <li v-for="id in experiment.design.guardrailMetricIds" :key="id">
        <span class="chip chip--warn">GUARDA</span> {{ metricName(id) }}
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
  margin: 0 0 8px;
  font-size: 18px;
}
h3 {
  margin: 14px 0 4px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
p {
  margin: 0;
}
.aviso {
  background: var(--warn-soft);
  color: var(--warn);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 4px;
}
.hipotese span {
  font-weight: 700;
  color: var(--brand);
}
.bracos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.braco {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.braco small {
  color: var(--muted);
  font-size: 12px;
}
.braco a {
  color: var(--brand);
  font-weight: 600;
  font-size: 14px;
}
.metricas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.metricas small {
  color: var(--muted);
  margin-left: 4px;
}
</style>
