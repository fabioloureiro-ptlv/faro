<script setup lang="ts">
// Aba Teste AB (experimental): recria, dentro do Faro, a tela "Testes A/B" do roadmap Digital — testes do
// roadmap, o que roda no DY e as consultas por trás. Se der certo, pode entrar no Acompanhamento.
import { computed } from 'vue';
import { navigateTo, useAsyncData, useHead, useRoute } from '#imports';
import { fmtData, fmtDataHora } from '../../composables/format';
import { useTestesAbApi } from '../../composables/useTestesAbApi';

useHead({ title: 'Teste AB' });

const api = useTestesAbApi();
const route = useRoute();
const { data: resumo } = await useAsyncData('ab-resumo', () => api.resumo());

const ABAS = ['roadmap', 'dy', 'queries'] as const;
type Aba = (typeof ABAS)[number];
const aba = computed<Aba>(() => (ABAS.includes(route.query.aba as Aba) ? (route.query.aba as Aba) : 'roadmap'));

function irPara(a: Aba) {
  return navigateTo({ query: { aba: a } });
}
</script>

<template>
  <div class="ab">
    <header class="ab-topo">
      <div>
        <h1>Teste AB</h1>
        <p class="lead">Testes do roadmap Digital e o resultado de cada um no Dynamic Yield. Aba experimental: se funcionar, vira parte do Acompanhamento.</p>
      </div>
    </header>

    <p v-if="resumo?.disponivel" class="ab-fonte small">
      Resultado do Dynamic Yield com dados até <b>{{ fmtData(resumo.dadosAte) }}</b>, buscado em {{ fmtDataHora(resumo.buscadoEm) }}.
      O botão “Atualizar da DY” do Acompanhamento busca de novo.
    </p>
    <p v-else-if="resumo" class="ab-fonte small t-warn-box" role="status">
      Ainda não há dados do DY nesta máquina. Rode <code>npm run job:sync-results -w @faro/api</code> (ou use o botão “Atualizar da DY” no Acompanhamento) para ver “Rodando no DY”.
    </p>

    <nav class="ab-abas" aria-label="Seções do Teste AB">
      <button type="button" :class="{ ativa: aba === 'roadmap' }" :aria-current="aba === 'roadmap' ? 'page' : undefined" @click="irPara('roadmap')">
        Testes do roadmap <small class="ab-mono">{{ resumo?.contagens.roadmap ?? '' }}</small>
      </button>
      <button type="button" :class="{ ativa: aba === 'dy' }" :aria-current="aba === 'dy' ? 'page' : undefined" @click="irPara('dy')">
        Rodando no DY <small class="ab-mono">{{ resumo?.disponivel ? resumo.contagens.dy : '' }}</small>
      </button>
      <button type="button" :class="{ ativa: aba === 'queries' }" :aria-current="aba === 'queries' ? 'page' : undefined" @click="irPara('queries')">Consultas</button>
    </nav>

    <AbRoadmap v-if="aba === 'roadmap'" />
    <AbDy v-else-if="aba === 'dy'" />
    <AbConsultas v-else />
  </div>
</template>

<style>
/* Tons da aba (a especificação usa good/warn/info/test); herdam os tokens do Faro. */
.ab {
  --ab-info: #3e6fb8; --ab-info-soft: #e6edf7; --ab-test: #8a5bb8; --ab-test-soft: #f0e8f7;
  --ab-good: var(--ok); --ab-good-soft: var(--ok-soft); --ab-warn: var(--warn); --ab-warn-soft: var(--warn-soft); --ab-bad: var(--risk); --ab-bad-soft: var(--risk-soft);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .ab { --ab-info: #8fb2e8; --ab-info-soft: #1d2a40; --ab-test: #c4a2ea; --ab-test-soft: #2c1d40; }
}
.ab code { font-family: ui-monospace, 'IBM Plex Mono', Menlo, monospace; font-size: 12px; background: var(--brand-soft); padding: 1px 5px; border-radius: 5px; }
.ab-mono { font-family: ui-monospace, 'IBM Plex Mono', Menlo, monospace; }
.ab-rotulo { font-family: ui-monospace, 'IBM Plex Mono', Menlo, monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.ab-topo { display: flex; justify-content: space-between; gap: 16px; }
.ab-fonte { margin: 0 0 16px; color: var(--muted); }
.t-warn-box { background: var(--warn-soft); color: var(--warn); border-radius: 10px; padding: 10px 14px; }

.ab-abas { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 20px; flex-wrap: wrap; }
.ab-abas button { border: 0; background: none; padding: 10px 14px; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; }
.ab-abas button.ativa { color: var(--ink); border-bottom-color: var(--brand); }
.ab-abas button small { margin-left: 6px; font-size: 11px; color: var(--muted); }

.ab-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; flex-wrap: wrap; background: var(--surface); }
.ab-seg button { border: 0; background: none; padding: 6px 13px; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--ink); }
.ab-seg button[aria-pressed='true'] { background: var(--brand); color: var(--on-brand); }
.ab-seg button b { font-family: ui-monospace, monospace; font-weight: 600; opacity: 0.8; margin-left: 3px; }
.ab-barra { display: flex; gap: 18px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px; }
.ab-grp, .ab-sel { display: flex; flex-direction: column; gap: 4px; }
.ab-sel select { width: auto; min-width: 220px; padding: 7px 10px; }

.ab-contadores { display: flex; gap: 28px; flex-wrap: wrap; margin-bottom: 18px; }
.ab-contadores b { display: block; font-size: 34px; line-height: 1; letter-spacing: -0.02em; }
.ab-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 6px 0 18px; }
.ab-kpis > div { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; }
.ab-kpis b { font-size: 28px; line-height: 1.1; }

.ab-chip { display: inline-block; font-size: 12px; border: 1px solid var(--line); background: var(--bg); border-radius: 999px; padding: 1px 9px; margin-left: 6px; font-weight: 600; vertical-align: 1px; }
.ab-chip.t-info { background: var(--ab-info-soft); color: var(--ab-info); border-color: transparent; }
.ab-chip.t-good { background: var(--ab-good-soft); color: var(--ab-good); border-color: transparent; }
.ab-chip.t-warn { background: var(--ab-warn-soft); color: var(--ab-warn); border-color: transparent; }
.ab-pill { display: inline-block; border-radius: 999px; padding: 2px 11px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.ab-pill.s-rodando, .ab-pill.d-split_desigual, .ab-pill.s-pendente { background: var(--ab-warn-soft); color: var(--ab-warn); }
.ab-pill.s-pronto { background: var(--ab-test-soft); color: var(--ab-test); }
.ab-pill.s-desenhando { background: var(--ab-info-soft); color: var(--ab-info); }
.ab-pill.s-concluido, .ab-pill.d-decidido, .ab-pill.d-volume_baixo { background: var(--brand-soft); color: var(--muted); }
.ab-pill.d-saudavel, .ab-pill.s-ok { background: var(--ab-good-soft); color: var(--ab-good); }

.ab-sig { display: inline-block; font-size: 12.5px; border-radius: 999px; padding: 2px 10px; white-space: nowrap; font-weight: 600; }
.ab-sig.t-good { background: var(--ab-good-soft); color: var(--ab-good); }
.ab-sig.t-good-outline { border: 1px solid var(--ab-good); color: var(--ab-good); }
.ab-sig.t-neutral { background: var(--brand-soft); color: var(--muted); }
.ab-sig.t-warn { background: var(--ab-warn-soft); color: var(--ab-warn); }
.ab-sig.t-bad { background: var(--ab-bad-soft); color: var(--ab-bad); }
.ab-chip.t-neutral { background: var(--bg); }
.ab-selo { font-size: 10px; font-weight: 800; letter-spacing: 0.05em; border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
.ab-selo.t-info { background: var(--ab-info); color: #fff; }
.ab-selo.t-warn { border: 1px solid var(--ab-warn); color: var(--ab-warn); }

.ab-link { background: none; border: 0; padding: 0; color: var(--brand); font-weight: 600; cursor: pointer; margin-left: 8px; text-decoration: none; }
.ab-link:hover { text-decoration: underline; }
.ab-trunc { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
.ab-aviso { color: var(--ab-warn); font-size: 12.5px; margin-left: 8px; font-weight: 600; }
.ab-decisao { color: var(--ab-good); font-weight: 600; }
.ab-nota { margin: 10px 0 0; }

.ab-cols { display: grid; grid-template-columns: minmax(260px, 3fr) 120px 92px minmax(120px, 1.2fr) minmax(140px, 1.6fr) 110px; gap: 12px; align-items: start; }
.ab-th { padding: 0 16px 8px; font-family: ui-monospace, monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.ab-grupo { margin: 18px 0 8px; }
.ab-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; }
.ab-nome { display: flex; gap: 8px; align-items: flex-start; }
.ab-seta { border: 0; background: none; cursor: pointer; font-size: 14px; color: var(--muted); padding: 2px 4px; }
.ab-detalhe { border-top: 1px solid var(--line); margin-top: 12px; padding-top: 6px; display: grid; gap: 4px; }
.ab-detalhe h4 { margin: 12px 0 4px; }
.ab-detalhe ul { margin: 0; padding-left: 18px; }
.ab-detalhe p { margin: 4px 0; }

.ab-scroll { overflow-x: auto; margin-bottom: 8px; }
table.ab-dy, table.ab-metricas { width: 100%; border-collapse: collapse; font-size: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.ab-dy th, .ab-metricas th { text-align: left; font-family: ui-monospace, monospace; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 10px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.ab-dy th button { all: unset; cursor: pointer; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; }
.ab-dy td, .ab-metricas td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
.ab-dy tr:last-child td, .ab-metricas tr:last-child td { border-bottom: 0; }
.ab-linha { cursor: pointer; }
.ab-linha:hover, .ab-linha:focus-visible { background: var(--brand-soft); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pos { color: var(--ab-good); font-weight: 600; }
.neg { color: var(--ab-bad); font-weight: 600; }
.ab-metricas .ab-sep { border-left: 3px solid var(--line); }
.ab-metricas tr.norte td { background: var(--ab-info-soft); }
.ab-grupo-linha th { background: var(--bg); color: var(--ink); }

.ab-det h2 { margin: 0 0 8px; }
.ab-det h3.ab-rotulo { margin: 22px 0 8px; }
.ab-sub { margin: 18px 0 8px; font-size: 16px; border-bottom: 2px solid var(--brand); display: inline-block; }
.ab-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ab-chips .ab-chip { margin-left: 0; }
.ab-variantes { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.ab-bola { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
.ab-sintese { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 4px 16px; }
.ab-fazer { border-left: 4px solid var(--brand); background: var(--surface); border-radius: 0 12px 12px 0; padding: 12px 16px; margin: 16px 0; display: grid; gap: 2px; border-top: 1px solid var(--line); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.ab-fazer b { font-size: 18px; }
.ab-fazer.r-ok { border-left-color: var(--ab-good); }
.ab-fazer.r-warn { border-left-color: var(--ab-warn); }
.ab-fazer.r-risk { border-left-color: var(--ab-bad); }
.ab-como { margin-top: 18px; }
.ab-como summary { cursor: pointer; font-weight: 600; }

.ab-consulta { display: grid; gap: 6px; margin-top: 12px; }
.ab-consulta-topo { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
.ab-sql { max-height: 420px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 12px; font-size: 12px; line-height: 1.45; white-space: pre; }

@media (max-width: 900px) {
  .ab-cols { grid-template-columns: 1fr 100px; }
  .ab-cols > :nth-child(n + 3) { display: none; }
  .ab-th { display: none; }
}
</style>
