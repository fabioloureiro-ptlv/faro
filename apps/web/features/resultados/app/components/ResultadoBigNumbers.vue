<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { Experiment, Grain, MetricDefinition, Platform } from '@faro/contracts';
import { useResultados } from '../composables/useResultados';
import { buildBigNumbers, hasData, type BigNumber } from '../domain';

const props = defineProps<{
  experiment: Experiment;
  metric: (id: string) => MetricDefinition | undefined;
}>();

const PLATFORM_LABEL: Record<Platform | 'all', string> = {
  all: 'Consolidado',
  site: 'Site',
  android: 'Android',
  ios: 'iOS',
};
const GRAIN_LABEL: Record<Grain, string> = { user: 'Usuário', session: 'Sessão' };

const platform = ref<Platform | 'all'>('all');
const grain = ref<Grain>('user');
const faroId = computed(() => props.experiment.faroId);
const { data, error, status, refresh } = useResultados(faroId, { platform, grain });

const platforms = computed<(Platform | 'all')[]>(() => data.value?.platforms ?? ['all']);
const grains = computed<Grain[]>(() => data.value?.availableGrains ?? ['user']);
const norteId = toRef(() => props.experiment.design.primaryMetricId);
const empty = computed(() => !!data.value && !hasData(data.value));
const tiles = computed<BigNumber[]>(() =>
  data.value && !empty.value
    ? buildBigNumbers({
        results: data.value,
        primaryMetricId: norteId.value,
        norte: props.metric(norteId.value),
      })
    : [],
);
// Fonte dos números: as consultas do roadmap do Digital (E8) ou, sem snapshot, fixtures de exemplo.
const roadmap = computed(() => data.value?.source === 'roadmap');
const fonte = computed(() =>
  roadmap.value ? 'consultas do roadmap (BigQuery)' : 'dados de exemplo',
);
</script>

<template>
  <section class="bloco" aria-labelledby="big-numbers-titulo">
    <div class="topo">
      <div>
        <h2 id="big-numbers-titulo">Números-chave</h2>
        <p class="sub">
          <template v-if="data">
            Dados até {{ data.asOf.slice(8, 10) }}/{{ data.asOf.slice(5, 7) }} (D-1) · fonte:
            {{ fonte }}.
          </template>
          <template v-else>Resultado consolidado do teste, direto da API de resultados.</template>
        </p>
      </div>
      <div v-if="data && !empty" class="filtros">
        <div v-if="grains.length > 1" class="seg" role="group" aria-label="Grão">
          <button
            v-for="g in grains"
            :key="g"
            type="button"
            :aria-pressed="grain === g"
            @click="grain = g"
          >
            {{ GRAIN_LABEL[g] }}
          </button>
        </div>
        <div v-if="platforms.length > 1" class="seg" role="group" aria-label="Plataforma">
          <button
            v-for="p in platforms"
            :key="p"
            type="button"
            :aria-pressed="platform === p"
            @click="platform = p"
          >
            {{ PLATFORM_LABEL[p] }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="data && !roadmap" class="aviso" role="note">
      Números de exemplo (fixtures). Para ler a mesma fonte do roadmap do Digital, rode
      <code>npm run job:sync-roadmap</code> (ou <code>npm run job:sync-results</code>) com acesso ao
      BigQuery e recarregue.
    </p>

    <p v-if="error" role="alert" class="erro">
      Não foi possível carregar os números-chave.
      <button type="button" class="btn ghost small" @click="refresh()">Tentar de novo</button>
    </p>
    <p v-else-if="status === 'pending' && !data" class="vazio" aria-busy="true">Carregando…</p>
    <p v-else-if="empty" class="vazio">
      Aguardando início. Os números aparecem assim que a primeira exposição for registrada.
    </p>

    <div v-else-if="tiles.length" class="tiles" :aria-busy="status === 'pending'">
      <article v-for="t in tiles" :key="t.id" class="tile" :class="{ hero: t.hero }">
        <div class="k">
          <span>{{ t.label }}</span>
          <span v-if="t.badge" class="st" :class="`st-${t.badge.tone}`">
            <i aria-hidden="true">{{ t.badge.icon }}</i>
            {{ t.badge.text }}
          </span>
        </div>
        <div
          class="v"
          :class="{ 'v-good': t.valueTone === 'good', 'v-bad': t.valueTone === 'bad' }"
        >
          {{ t.value }}
        </div>
        <div v-for="(line, i) in t.detail" :key="i" class="d">
          <template v-for="(s, j) in line" :key="j">
            <b v-if="s.strong">{{ s.text }}</b>
            <template v-else>{{ s.text }}</template>
          </template>
        </div>
        <div
          v-if="t.progress !== undefined"
          class="bar-prog"
          role="progressbar"
          :aria-valuenow="Math.round(t.progress * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${t.progress * 100}%` }"></span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.bloco {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px 18px;
}
.topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
h2 {
  margin: 0;
  font-size: 18px;
}
.sub {
  color: var(--muted);
  font-size: 13.5px;
  margin: 2px 0 0;
}
.filtros {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px;
  background: var(--bg);
  flex-wrap: wrap;
}
.seg button {
  border: 0;
  background: none;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  color: var(--muted);
}
.seg button[aria-pressed='true'] {
  background: var(--brand);
  color: var(--on-brand);
}
.erro {
  color: var(--risk);
  margin: 12px 0 0;
}
.aviso {
  background: var(--warn-soft);
  color: var(--warn);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 12px 0 0;
  font-size: 13.5px;
}
.aviso code {
  font-size: 12.5px;
}
.vazio {
  color: var(--muted);
  margin: 12px 0 0;
}

/* stat tiles / hero, como no protótipo (docs/demo) */
.tiles {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}
.tiles[aria-busy='true'] {
  opacity: 0.6;
}
.tile {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
  min-width: 0;
}
.k {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.v {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--ink);
  letter-spacing: -0.02em;
}
.hero .v {
  font-size: 40px;
}
.v-good {
  color: var(--ok);
}
.v-bad {
  color: var(--risk);
}
.d {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}
.d b {
  color: var(--ink);
  font-weight: 600;
}
/* status com cor reservada: sempre ícone + texto */
.st {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
  text-transform: none;
  letter-spacing: 0;
}
.st i {
  font-style: normal;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--on-brand);
  flex: none;
}
.st-good i {
  background: var(--ok);
  color: #fff;
}
.st-warn i {
  background: var(--gate);
  color: var(--gate-ink);
}
.st-critical i {
  background: var(--risk);
  color: #fff;
}
.st-none i {
  background: var(--muted);
  color: #fff;
}
.bar-prog {
  height: 8px;
  border-radius: 4px;
  background: var(--line);
  overflow: hidden;
  margin-top: 8px;
}
.bar-prog span {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 4px;
}
@media (max-width: 980px) {
  .tiles {
    grid-template-columns: 1fr 1fr;
  }
  .tile.hero {
    grid-column: span 2;
  }
}
@media (max-width: 520px) {
  .tiles {
    grid-template-columns: 1fr;
  }
  .tile.hero {
    grid-column: auto;
  }
  .hero .v {
    font-size: 32px;
  }
}
</style>
