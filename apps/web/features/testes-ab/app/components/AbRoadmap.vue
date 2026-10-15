<script setup lang="ts">
// Aba "Testes do roadmap": o cadastro do roadmap Digital, agrupado por status, com o resultado do DY ao lado.
import { computed, reactive, ref } from 'vue';
import { navigateTo, useAsyncData } from '#imports';
import { fmtData, fmtDelta } from '../composables/format';
import { mensagemDeErro, useTestesAbApi } from '../composables/useTestesAbApi';
import type { StatusRoadmap, TesteRoadmap } from '../composables/types';

const api = useTestesAbApi();
const { data, error } = await useAsyncData('ab-roadmap', () => api.roadmap());

const GRUPOS: { status: StatusRoadmap; rotulo: string; contador: string }[] = [
  { status: 'rodando', rotulo: 'Rodando', contador: 'Rodando' },
  { status: 'pronto', rotulo: 'Pronto p/ ligar', contador: 'Prontos p/ ligar' },
  { status: 'concluido', rotulo: 'Concluído', contador: 'Concluídos' },
  { status: 'desenhando', rotulo: 'Desenhando', contador: 'Desenhando' },
];
const ORDEM_TABELA: StatusRoadmap[] = ['rodando', 'pronto', 'desenhando', 'concluido'];
const ROTULO_STATUS: Record<StatusRoadmap, string> = { desenhando: 'desenhando', pronto: 'pronto p/ ligar', rodando: 'rodando', concluido: 'concluído' };

const filtroStatus = ref<'todos' | StatusRoadmap>('todos');
const filtroIndicador = ref('');
const abertos = reactive(new Set<number>());

const testes = computed(() =>
  (data.value?.testes ?? []).filter(
    (t) => (filtroStatus.value === 'todos' || t.status === filtroStatus.value) && (!filtroIndicador.value || t.indicador === filtroIndicador.value),
  ),
);
const grupos = computed(() =>
  ORDEM_TABELA.map((status) => ({ status, itens: testes.value.filter((t) => t.status === status) })).filter((g) => g.itens.length),
);

function alternar(id: number) {
  if (abertos.has(id)) abertos.delete(id);
  else abertos.add(id);
}

function inicio(t: TesteRoadmap): string {
  if (!t.dataInicio) return 'sem data';
  return t.diasEmCampo ? `${fmtData(t.dataInicio)} · ${t.diasEmCampo}d` : fmtData(t.dataInicio);
}

const toneChip = (p: number | null) => (p == null ? 'neutral' : p >= 0.85 ? 'good' : p <= 0.15 ? 'warn' : 'neutral');
const nomeCurto = (metrica: string) => metrica.split(' ')[0];

function verNoDy(campanha: string, stream: string) {
  return navigateTo({ query: { aba: 'dy', stream, campanha } });
}
</script>

<template>
  <p v-if="error" class="err" role="alert">{{ mensagemDeErro(error) }}</p>
  <template v-else-if="data">
    <div class="ab-contadores">
      <div v-for="g in GRUPOS" :key="g.status">
        <b>{{ data.contadores[g.status] }}</b>
        <span class="ab-rotulo">{{ g.contador }}</span>
      </div>
    </div>

    <div class="ab-filtros">
      <div class="ab-seg" role="group" aria-label="Filtrar por status">
        <button type="button" :aria-pressed="filtroStatus === 'todos'" @click="filtroStatus = 'todos'">Todos</button>
        <button v-for="s in (['desenhando', 'pronto', 'rodando', 'concluido'] as StatusRoadmap[])" :key="s" type="button" :aria-pressed="filtroStatus === s" @click="filtroStatus = s">
          {{ s === 'pronto' ? 'Pronto p/ ligar' : s === 'concluido' ? 'Concluído' : s[0]!.toUpperCase() + s.slice(1) }}
        </button>
      </div>
      <label class="ab-sel">
        <span class="ab-rotulo">Métrica</span>
        <select v-model="filtroIndicador">
          <option value="">Todas as métricas</option>
          <option v-for="i in data.indicadores" :key="i.rotulo" :value="i.rotulo">{{ i.rotulo }} ({{ i.quantidade }})</option>
        </select>
      </label>
    </div>

    <p v-if="!grupos.length" class="muted">Nenhum teste com esses filtros.</p>

    <div v-else class="ab-tabela" role="table" aria-label="Testes do roadmap">
      <div class="ab-th ab-cols" role="row">
        <span role="columnheader">Teste</span><span role="columnheader">Status</span><span role="columnheader">Início</span>
        <span role="columnheader">Indicador</span><span role="columnheader">Iniciativa</span><span role="columnheader">Squad</span>
      </div>

      <template v-for="g in grupos" :key="g.status">
        <div class="ab-grupo ab-rotulo">{{ ROTULO_STATUS[g.status] }} · {{ g.itens.length }}</div>

        <article v-for="t in g.itens" :id="`teste-${t.id}`" :key="t.id" class="ab-card">
          <div class="ab-cols" role="row">
            <div class="ab-nome">
              <button type="button" class="ab-seta" :aria-expanded="abertos.has(t.id)" :aria-label="abertos.has(t.id) ? 'Recolher' : 'Expandir'" @click="alternar(t.id)">{{ abertos.has(t.id) ? '▾' : '▸' }}</button>
              <div>
                <b>{{ t.nome }}</b>
                <span v-if="t.cenarios?.length" class="muted small"> · {{ t.cenarios.length }} cenários</span>
                <span v-if="t.dy.atrelado" class="ab-chip t-info" title="Tem campanha do DY atrelada">DY ✓</span>
                <span
                  v-if="t.dy.resultado"
                  class="ab-chip"
                  :class="`t-${toneChip(t.dy.resultado.cmp.p)}`"
                  :title="`${t.dy.resultado.variante} contra o controle: uplift e P(vence)`"
                >{{ nomeCurto(t.dy.resultado.metrica) }} {{ fmtDelta(t.dy.resultado.cmp.uplift) }} · {{ Math.round((t.dy.resultado.cmp.p ?? 0) * 100) }}%</span>
                <span v-if="t.avisos.length" class="ab-aviso">⚠ {{ t.avisos.join(', ') }}</span>
                <div v-if="t.decisao" class="small ab-decisao">Subiu {{ t.decisao.variante }} em {{ fmtData(t.decisao.data, true) }}</div>
                <div v-if="t.iniciativa" class="small muted">↳ {{ t.iniciativa }}</div>
              </div>
            </div>
            <span><span class="ab-pill" :class="`s-${t.status}`">{{ ROTULO_STATUS[t.status] }}</span></span>
            <span class="ab-mono small">{{ inicio(t) }}</span>
            <span class="small"><span v-if="t.indicador" class="ab-mono ab-trunc" :title="t.indicador">{{ t.indicador }}</span></span>
            <span class="small ab-trunc" :title="t.iniciativa">{{ t.iniciativa ?? '—' }}</span>
            <span><span v-if="t.squad" class="ab-chip">{{ t.squad }}</span></span>
          </div>

          <div v-if="abertos.has(t.id)" class="ab-detalhe">
            <section v-if="t.cenarios?.length">
              <h4 class="ab-rotulo">Cenários testados</h4>
              <ul>
                <li v-for="c in t.cenarios" :key="c.nome">
                  <b>{{ c.nome }}</b> — {{ c.descricao }}
                  <span v-if="c.rollout" class="ab-chip t-good">rollout</span>
                </li>
              </ul>
            </section>

            <section>
              <h4 class="ab-rotulo">Resultado no Dynamic Yield</h4>
              <template v-if="t.dy.atrelado">
                <p class="small">
                  <span v-for="c in t.dy.campanhas" :key="c" class="ab-chip ab-mono">{{ c }}</span>
                </p>
                <p v-if="t.dy.resultado" class="small">
                  {{ t.dy.resultado.variante }} · {{ t.dy.resultado.metrica }} {{ fmtDelta(t.dy.resultado.cmp.uplift) }}
                  <AbSig :sig="t.dy.resultado.cmp.sig" />
                  <button type="button" class="ab-link" @click="verNoDy(t.dy.resultado.campanha, t.dy.resultado.stream)">Ver detalhe do teste →</button>
                </p>
                <p v-else class="small muted">Sem leitura comparável no último sync (teste decidido ou sem variantes).</p>
              </template>
              <p v-else class="small muted">
                Sem campanha do DY atrelada.
                <template v-if="t.campanhasRelacionadas?.length">Existe no DY, mas não está atrelada: {{ t.campanhasRelacionadas.join(', ') }}.</template>
              </p>
            </section>

            <section v-if="t.contexto">
              <h4 class="ab-rotulo">Contexto / hipótese</h4>
              <p class="small">{{ t.contexto }}</p>
              <p v-if="t.documentacao" class="small"><a :href="t.documentacao" target="_blank" rel="noopener">Documentação</a></p>
            </section>

            <p v-if="t.temAcompanhamento" class="small muted">Tem link de “Acompanhar resultado” cadastrado no roadmap.</p>

            <section v-if="t.resumo">
              <h4 class="ab-rotulo">Resumo de resultados</h4>
              <p class="small">{{ t.resumo }}</p>
            </section>

            <p v-if="!t.dy.resultado && !t.resumo" class="small muted">Sem resultados ainda.</p>
          </div>
        </article>
      </template>
    </div>
  </template>
</template>
