<script setup lang="ts">
// Aba "Mapa temporal": uma barra por campanha da DY, por página. Só o que o DY mostra (snapshot de resultados,
// a mesma base da lista); nenhum experimento cadastrado no Faro entra aqui. Com uma área escolhida na Visão Geral,
// só os testes dela aparecem (mais os de ecossistema, que valem para qualquer área); os outros somem do mapa.
import { computed } from 'vue';
import { useAsyncData } from '#imports';
import type { Experiment } from '@faro/contracts';
import PainelMapa from '~~/features/painel/app/components/PainelMapa.vue';
import { BU_LABEL, addDays, buildTimeMap, formatDayMonth } from '~~/features/painel/app/domain';
import { useBuFiltro } from '../composables/useBuFiltro';
import { mensagemDeErro, useTestesAbApi } from '../composables/useTestesAbApi';
import type { TesteNoMapa } from '../composables/types';

const api = useTestesAbApi();
const { bu, naArea } = useBuFiltro();
const { data: dy, error, refresh } = await useAsyncData('mapa-dy', () => api.mapa());

const SEM_PAGINA = 'sem_pagina';
// O mapa só precisa de nome, BU, status, período e páginas; o resto do Experiment não existe para quem vem da DY.
const comoExperimento = (t: TesteNoMapa): Experiment =>
  ({
    faroId: t.key,
    name: t.campanha,
    bu: t.bu,
    status: t.status.key === 'decidido' ? 'decidido' : 'rodando',
    allocation: {
      pages: t.paginas.length ? t.paginas : [SEM_PAGINA],
      platforms: t.stream === 'app' ? ['android', 'ios'] : ['site'],
      startDate: t.inicio,
      endDate: t.fim,
    },
    overlap: [],
  }) as unknown as Experiment;

const testes = computed(() => new Map((dy.value?.testes ?? []).map((t) => [t.key, t])));
const semPagina = computed(() => visiveis.value.filter((t) => !t.paginas.length).length);

const visiveis = computed(() => [...testes.value.values()].filter((t) => naArea(t.bu)));
const linkDe = (t: TesteNoMapa) =>
  `/visao-geral?aba=dy&stream=${t.stream}&campanha=${encodeURIComponent(t.campanha)}${bu.value === 'todas' ? '' : `&bu=${bu.value}`}`;

// Hoje = dia seguinte ao dado mais recente (D-1): igual no SSR e no navegador.
const map = computed(() =>
  dy.value
    ? buildTimeMap(visiveis.value.map(comoExperimento), dy.value.paginas, {
        // A área já filtrou a lista acima: nenhuma barra fica esmaecida.
        bu: 'todas',
        today: addDays(dy.value.dadosAte, 1),
        extra: (e) => {
          const t = testes.value.get(e.faroId);
          return t ? { href: linkDe(t), note: `DY · ${t.status.rotulo} · ${t.stream === 'app' ? 'app' : 'web'}` } : {};
        },
      })
    : undefined,
);
</script>

<template>
  <p v-if="error" class="err" role="alert">
    {{ mensagemDeErro(error, 'Não foi possível carregar os testes do DY.') }}
    <button type="button" class="ab-link" @click="refresh()">Tentar de novo</button>
  </p>
  <template v-else-if="map && dy">
    <p class="small muted ab-nota" style="margin-top: 0">
      Testes da DY por página de {{ formatDayMonth(map.start) }} a {{ formatDayMonth(map.end) }} (dados até {{ formatDayMonth(dy.dadosAte) }}). Clique numa barra para ver o teste.
      <template v-if="bu !== 'todas'">Só os testes de {{ BU_LABEL[bu] }} (e de ecossistema) aparecem.</template>
    </p>
    <p v-if="semPagina" class="small muted ab-nota">
      {{ semPagina }} {{ semPagina === 1 ? 'teste do DY não tem' : 'testes do DY não têm' }} página identificada no export e ficam na linha “Página não identificada”.
    </p>
    <PainelMapa :map="map" />
  </template>
</template>
