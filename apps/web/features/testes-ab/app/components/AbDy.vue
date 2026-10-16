<script setup lang="ts">
// Aba "Rodando no DY": todas as campanhas com exposição no DY (consulta de resultados do roadmap), com as
// variáveis da antiga Lista do Acompanhamento (onde roda, período, métrica principal, alertas, testes na mesma página),
// filtros, KPIs, tabela ordenável e o detalhe de cada teste. Grão, stream, métrica, status e teste aberto
// vivem na URL; o filtro de área (?bu=) vem da Visão Geral.
import { computed, ref } from 'vue';
import { navigateTo, useAsyncData, useRoute } from '#imports';
import { fmtData, fmtDelta, fmtInt, fmtValor, rotuloStream } from '../composables/format';
import { useBuFiltro } from '../composables/useBuFiltro';
import { mensagemDeErro, useTestesAbApi } from '../composables/useTestesAbApi';
import type { Grao, LinhaDy, StatusDy, StreamFiltro } from '../composables/types';

const api = useTestesAbApi();
const route = useRoute();
const { naArea } = useBuFiltro();
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : undefined);

const grao = computed<Grao>(() => (q('grao') === 'sessao' ? 'sessao' : 'usuario'));
const stream = computed<StreamFiltro>(() => (q('stream') === 'web' || q('stream') === 'app' ? (q('stream') as StreamFiltro) : 'todos'));
const metrica = computed(() => q('metrica') ?? 'rpu');
const statusSel = computed(() => (q('status') ? q('status')!.split(',') : []) as StatusDy['key'][]);
const campanha = computed(() => q('campanha'));
const streamAberto = computed<'web' | 'app'>(() => (q('stream') === 'web' ? 'web' : 'app'));

function ir(patch: Record<string, string | undefined>) {
  return navigateTo({ query: { ...route.query, aba: 'dy', ...patch } }, { replace: true });
}

const { data, error } = await useAsyncData(
  'ab-dy',
  () => api.dy({ grao: grao.value, stream: stream.value, metrica: metrica.value }),
  { watch: [grao, stream, metrica] },
);
const { data: detalhe, error: erroDetalhe } = await useAsyncData(
  'ab-dy-detalhe',
  async () => (campanha.value ? api.detalhe({ campanha: campanha.value, stream: streamAberto.value, grao: grao.value }) : null),
  { watch: [campanha, streamAberto, grao] },
);

const STATUS: { key: StatusDy['key']; rotulo: string }[] = [
  { key: 'saudavel', rotulo: 'Saudável' },
  { key: 'split_desigual', rotulo: 'Split desigual' },
  { key: 'volume_baixo', rotulo: 'Volume baixo' },
  { key: 'decidido', rotulo: 'Decidido' },
];

function alternarStatus(k: StatusDy['key']) {
  const s = new Set(statusSel.value);
  if (s.has(k)) s.delete(k);
  else s.add(k);
  return ir({ status: s.size ? [...s].join(',') : undefined });
}

// Filtros da antiga Lista que não precisam ir para a URL.
const busca = ref('');
const pagina = ref('');
const soAlerta = ref(false);
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SEM_PAGINA = '__sem_pagina';

// O filtro de área e os filtros da Lista valem para a lista, os KPIs e os contadores de status.
const base = computed(() =>
  (data.value?.testes ?? []).filter((t) => {
    if (!naArea(t.area)) return false;
    if (busca.value.trim() && !semAcento(`${t.campanha} ${t.squad ?? ''}`).includes(semAcento(busca.value.trim()))) return false;
    if (pagina.value === SEM_PAGINA ? t.paginas.length > 0 : pagina.value && !t.paginas.includes(pagina.value)) return false;
    if (soAlerta.value && !t.alertas.length) return false;
    return true;
  }),
);
const statusContagem = computed(() => {
  const c: Record<StatusDy['key'], number> = { saudavel: 0, split_desigual: 0, volume_baixo: 0, decidido: 0 };
  for (const t of base.value) c[t.status.key] += 1;
  return c;
});
const filtrados = computed(() => base.value.filter((t) => !statusSel.value.length || statusSel.value.includes(t.status.key)));
const kpis = computed(() => ({
  testes: filtrados.value.length,
  splitValido: filtrados.value.filter((t) => t.status.key === 'saudavel').length,
  decididosLigados: filtrados.value.filter((t) => t.status.key === 'decidido').length,
  confirmados: filtrados.value.filter((t) => t.status.key === 'saudavel' && t.cmp?.confirmado && t.cmp.uplift > 0).length,
}));

type Chave = 'campanha' | 'status' | 'base' | 'split' | 'controle' | 'melhor' | 'uplift' | 'p' | 'periodo' | 'norte' | 'alertas' | 'mesmaPagina';
const sort = ref<{ k: Chave; dir: 1 | -1 }>({ k: 'base', dir: -1 });
function ordenarPor(k: Chave) {
  sort.value = { k, dir: sort.value.k === k ? ((-sort.value.dir) as 1 | -1) : k === 'campanha' || k === 'status' ? 1 : -1 };
}
const valorDe = (t: LinhaDy, k: Chave): string | number => {
  switch (k) {
    case 'campanha': return t.campanha.toLowerCase();
    case 'status': return t.status.rotulo;
    case 'base': return t.base;
    case 'split': return t.split;
    case 'controle': return t.controle ?? -Infinity;
    case 'melhor': return t.melhor?.valor ?? -Infinity;
    case 'uplift': return t.cmp?.uplift ?? -Infinity;
    case 'p': return t.cmp?.p ?? -Infinity;
    case 'periodo': return t.periodo.inicio ?? '';
    case 'norte': return t.norte.cmp?.uplift ?? -Infinity;
    case 'alertas': return t.alertas.length;
    case 'mesmaPagina': return t.mesmaPagina;
  }
};
const testes = computed(() => {
  const { k, dir } = sort.value;
  return [...filtrados.value].sort((a, b) => {
    const x = valorDe(a, k);
    const y = valorDe(b, k);
    return (typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : x - (y as number)) * dir;
  });
});
const setaDe = (k: Chave) => (sort.value.k === k ? (sort.value.dir === 1 ? '▲' : '▼') : '');
const ariaSort = (k: Chave) => (sort.value.k === k ? (sort.value.dir === 1 ? 'ascending' : 'descending') : 'none');

const formato = computed(() => data.value?.metrica.formato ?? 'brl');
const nomePagina = (id: string) => data.value?.paginasCatalogo.find((p) => p.id === id)?.name ?? id;
const onde = (t: LinhaDy) => `${t.plataformas.join(' · ')} · ${t.paginas.length ? t.paginas.map(nomePagina).join(', ') : 'página não identificada'}`;
const abrir = (t: LinhaDy) => ir({ campanha: t.campanha, stream: t.stream });
const voltar = () => ir({ campanha: undefined });
const limpar = () => {
  busca.value = '';
  pagina.value = '';
  soAlerta.value = false;
  return ir({ status: undefined });
};
const temFiltro = computed(() => !!(busca.value || pagina.value || soAlerta.value || statusSel.value.length));

const COLUNAS: [Chave, string][] = [
  ['campanha', 'Teste'], ['status', 'Status'], ['periodo', 'Período'], ['base', 'Base'], ['split', 'Split'],
  ['controle', 'Controle'], ['melhor', 'Melhor variante'], ['uplift', 'Uplift'],
];
</script>

<template>
  <p v-if="error" class="err" role="alert">{{ mensagemDeErro(error) }}</p>
  <template v-else-if="data">
    <!-- Teste aberto -->
    <template v-if="campanha">
      <div class="ab-barra">
        <button type="button" class="btn ghost small" @click="voltar">← Todos os testes</button>
        <div class="ab-seg" role="group" aria-label="Grão">
          <button type="button" :aria-pressed="grao === 'usuario'" @click="ir({ grao: undefined })">Usuário</button>
          <button type="button" :aria-pressed="grao === 'sessao'" @click="ir({ grao: 'sessao' })">Sessão</button>
        </div>
      </div>
      <p v-if="erroDetalhe" class="err" role="alert">{{ mensagemDeErro(erroDetalhe, 'Teste não encontrado neste grão.') }}</p>
      <AbDyDetalhe v-else-if="detalhe" :detalhe="detalhe" />
    </template>

    <!-- Lista -->
    <template v-else>
      <div class="ab-barra ab-filtros">
        <div class="ab-grp">
          <span class="ab-rotulo">Grão</span>
          <div class="ab-seg" role="group" aria-label="Grão">
            <button type="button" :aria-pressed="grao === 'usuario'" @click="ir({ grao: undefined })">Usuário</button>
            <button type="button" :aria-pressed="grao === 'sessao'" @click="ir({ grao: 'sessao' })">Sessão</button>
          </div>
        </div>
        <div class="ab-grp">
          <span class="ab-rotulo">Plataforma</span>
          <div class="ab-seg" role="group" aria-label="Plataforma">
            <button type="button" :aria-pressed="stream === 'todos'" @click="ir({ stream: undefined })">Todas</button>
            <button type="button" :aria-pressed="stream === 'web'" @click="ir({ stream: 'web' })">Site</button>
            <button type="button" :aria-pressed="stream === 'app'" @click="ir({ stream: 'app' })">App</button>
          </div>
        </div>
        <label class="ab-sel">
          <span class="ab-rotulo">Métrica na tabela</span>
          <select :value="metrica" @change="ir({ metrica: ($event.target as HTMLSelectElement).value === 'rpu' ? undefined : ($event.target as HTMLSelectElement).value })">
            <option v-for="m in data.metricas" :key="m.key" :value="m.key">{{ m.label }}</option>
          </select>
        </label>
        <label class="ab-sel">
          <span class="ab-rotulo">Página</span>
          <select v-model="pagina">
            <option value="">Todas</option>
            <option v-for="p in data.paginasCatalogo" :key="p.id" :value="p.id">{{ p.name }}</option>
            <option :value="SEM_PAGINA">Não identificada</option>
          </select>
        </label>
        <label class="ab-sel ab-busca">
          <span class="ab-rotulo">Buscar</span>
          <input v-model="busca" type="search" placeholder="Nome da campanha ou squad">
        </label>
      </div>

      <div class="ab-barra ab-filtros">
        <div class="ab-grp">
          <span class="ab-rotulo">Status (mais de um vale)</span>
          <div class="ab-seg" role="group" aria-label="Status">
            <button v-for="s in STATUS" :key="s.key" type="button" :aria-pressed="statusSel.includes(s.key)" @click="alternarStatus(s.key)">
              {{ s.rotulo }} <b>{{ statusContagem[s.key] }}</b>
            </button>
          </div>
        </div>
        <label class="ab-check"><input v-model="soAlerta" type="checkbox"> Só com alerta</label>
        <button v-if="temFiltro" type="button" class="ab-link" @click="limpar">Limpar filtros</button>
      </div>

      <div class="ab-kpis">
        <div><span class="ab-rotulo">Testes na seleção</span><b>{{ kpis.testes }}</b></div>
        <div><span class="ab-rotulo">Com split válido</span><b>{{ kpis.splitValido }}</b></div>
        <div><span class="ab-rotulo">Já decididos, ainda ligados</span><b>{{ kpis.decididosLigados }}</b></div>
        <div>
          <span class="ab-rotulo">Resultado confirmado</span><b>{{ kpis.confirmados }}</b>
          <small class="muted">em {{ data.metrica.label.toLowerCase() }}</small>
        </div>
      </div>

      <p v-if="!testes.length" class="muted">Nenhum teste com esses filtros.</p>
      <div v-else class="ab-scroll">
        <table class="ab-dy">
          <thead>
            <tr>
              <th v-for="c in COLUNAS" :key="c[0]" :aria-sort="ariaSort(c[0])">
                <button type="button" @click="ordenarPor(c[0])">{{ c[1] }} {{ setaDe(c[0]) }}</button>
              </th>
              <th>IC 95%</th>
              <th :aria-sort="ariaSort('p')"><button type="button" @click="ordenarPor('p')">Significância {{ setaDe('p') }}</button></th>
              <th :aria-sort="ariaSort('norte')"><button type="button" @click="ordenarPor('norte')">Métrica principal {{ setaDe('norte') }}</button></th>
              <th :aria-sort="ariaSort('alertas')"><button type="button" @click="ordenarPor('alertas')">Alertas {{ setaDe('alertas') }}</button></th>
              <th :aria-sort="ariaSort('mesmaPagina')"><button type="button" @click="ordenarPor('mesmaPagina')">Na mesma página {{ setaDe('mesmaPagina') }}</button></th>
              <th>No roadmap</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in testes" :key="t.key" class="ab-linha" tabindex="0" @click="abrir(t)" @keydown.enter="abrir(t)">
              <td class="ab-teste">
                <b>{{ t.campanha }}</b>
                <span class="ab-chip">{{ rotuloStream(t.stream) }}</span>
                <span v-if="t.cross" class="ab-chip t-info">ECOSSISTEMA</span>
                <span v-if="t.squad" class="ab-chip">{{ t.squad }}</span>
                <div class="small muted">{{ onde(t) }}</div>
              </td>
              <td><span class="ab-pill" :class="`d-${t.status.key}`" :title="t.status.dica">{{ t.status.rotulo }}</span></td>
              <td class="small ab-nobr">
                {{ fmtData(t.periodo.inicio) }} → {{ fmtData(t.periodo.fim) }}
                <div v-if="t.periodo.dias" class="muted">{{ t.periodo.dias }} dias</div>
              </td>
              <td class="num">{{ fmtInt(t.base) }} <small class="muted">{{ t.unidade }}</small></td>
              <td class="ab-mono">{{ t.split }}</td>
              <td class="num">{{ fmtValor(t.controle, formato) }}</td>
              <td class="num">{{ t.melhor ? fmtValor(t.melhor.valor, formato) : '—' }}</td>
              <td class="num" :class="t.cmp ? (t.cmp.uplift >= 0 ? 'pos' : 'neg') : ''">{{ t.cmp ? fmtDelta(t.cmp.uplift) : '—' }}</td>
              <td class="num small">{{ t.cmp && t.cmp.low != null && t.cmp.high != null ? `${fmtDelta(t.cmp.low)} a ${fmtDelta(t.cmp.high)}` : '—' }}</td>
              <td><AbSig :sig="t.cmp?.sig" /></td>
              <td class="small">
                <b>{{ t.norte.label }}</b>
                <div v-if="t.norte.cmp"><span :class="t.norte.cmp.uplift >= 0 ? 'pos' : 'neg'">{{ fmtDelta(t.norte.cmp.uplift) }}</span> <AbSig :sig="t.norte.cmp.sig" curto /></div>
                <div v-else class="muted">sem leitura</div>
              </td>
              <td class="small">
                <span v-for="a in t.alertas" :key="a" class="ab-alerta">{{ a }}</span>
                <span v-if="!t.alertas.length" class="muted">—</span>
              </td>
              <td class="num" :title="t.mesmaPagina ? 'Outros testes rodando na mesma página com período que cruza este' : ''">
                <span :class="{ 'ab-sobre': t.mesmaPagina }">{{ t.paginas.length ? t.mesmaPagina : '—' }}</span>
              </td>
              <td class="small">
                <template v-if="t.roadmap.atrelados.length || t.roadmap.relacionados.length">
                  <NuxtLink v-for="id in t.roadmap.atrelados" :key="id" :to="{ query: { aba: 'roadmap' }, hash: `#teste-${id}` }" class="ab-link" @click.stop>#{{ id }}</NuxtLink>
                  <span v-for="id in t.roadmap.relacionados" :key="`r${id}`" class="muted">(#{{ id }})</span>
                </template>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small muted ab-nota">
        Testes com exposição no último sync ({{ data.dadosAte.slice(8, 10) }}/{{ data.dadosAte.slice(5, 7) }}), device consolidado. Clique numa linha para abrir o detalhe.
        Uplift, intervalo e significância são da melhor variante contra o controle na métrica escolhida; a coluna Métrica principal usa a métrica principal de cada teste. Teste decidido mostra — nas colunas comparativas.
        “Na mesma página” conta os outros testes rodando na mesma página com período que cruza o deste. A página vem do export da DY; sem ela, o teste fica como “não identificada”.
      </p>
      <p class="small muted ab-nota">
        As campanhas descobertas (exposição nos últimos 7 dias, com sugestão de cadastro) dependem da consulta <code>dy_discovery</code>, que ainda não está salva em
        <code>data/queries/roadmap/</code>; veja a aba Consultas.
      </p>
    </template>
  </template>
</template>
