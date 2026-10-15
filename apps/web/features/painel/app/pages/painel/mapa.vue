<script setup lang="ts">
// Mapa temporal só com o que existe na DY: uma barra por campanha do snapshot de resultados, a mesma
// base da aba Teste AB. Nenhum experimento cadastrado no Faro entra aqui (GET /testes-ab/mapa).
import { computed } from 'vue';
import { useAsyncData, useHead } from '#imports';
import type { Experiment } from '@faro/contracts';
import PainelMapa from '~~/features/painel/app/components/PainelMapa.vue';
import PainelBuTabs from '~~/features/painel/app/components/PainelBuTabs.vue';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import { usePainel } from '~~/features/painel/app/composables/usePainel';
import { BU_LABEL, addDays, buildTimeMap, formatDayMonth } from '~~/features/painel/app/domain';
import type { TesteNoMapa } from '~~/features/testes-ab/app/composables/types';
import { mensagemDeErro, useTestesAbApi } from '~~/features/testes-ab/app/composables/useTestesAbApi';

useHead({ title: 'Acompanhamento · Mapa temporal' });

const painel = usePainel();
const { filters } = painel;
const api = useTestesAbApi();

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
const semPagina = computed(() => (dy.value?.testes ?? []).filter((t) => !t.paginas.length).length);

// Hoje = dia seguinte ao dado mais recente (D-1): igual no SSR e no navegador.
const map = computed(() =>
  dy.value
    ? buildTimeMap([...testes.value.values()].map(comoExperimento), dy.value.paginas, {
        bu: filters.value.bu,
        today: addDays(dy.value.dadosAte, 1),
        ...(filters.value.from ? { from: filters.value.from } : {}),
        ...(filters.value.to ? { to: filters.value.to } : {}),
        extra: (e) => {
          const t = testes.value.get(e.faroId);
          return t
            ? { href: `/testes-ab?aba=dy&stream=${t.stream}&campanha=${encodeURIComponent(t.campanha)}`, note: `DY · ${t.status.rotulo} · ${t.stream === 'app' ? 'app' : 'web'}` }
            : {};
        },
      })
    : undefined,
);
</script>

<template>
  <main class="pagina">
    <header class="topo">
      <div>
        <h1>Mapa temporal</h1>
        <p v-if="map" class="sub">
          Testes da DY por página de {{ formatDayMonth(map.start) }} a {{ formatDayMonth(map.end) }}, só o que o DY mostra
          (dados até {{ formatDayMonth(dy!.dadosAte) }}). Clique numa barra para ver o teste.
        </p>
      </div>
      <PainelNav />
    </header>

    <p v-if="error" role="alert" class="erro">
      {{ mensagemDeErro(error, 'Não foi possível carregar os testes do DY.') }}
      <button type="button" @click="refresh()">Tentar de novo</button>
    </p>

    <template v-else-if="map">
      <PainelBuTabs :bu="filters.bu" class="abas" @select="(bu) => painel.update({ bu })" />
      <p v-if="filters.bu !== 'todas'" class="dica">
        Testes de outras BUs aparecem esmaecidos quando cruzam um teste de {{ BU_LABEL[filters.bu] }} na mesma
        página.
      </p>
      <p v-if="semPagina" class="dica">
        {{ semPagina }} {{ semPagina === 1 ? 'teste do DY não tem' : 'testes do DY não têm' }} página identificada no export e ficam na linha “Página não identificada”.
      </p>
      <PainelMapa :map="map" />
    </template>
  </main>
</template>

<style scoped>
.pagina {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.topo {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.01em;
}
.sub,
.dica {
  margin: 4px 0 16px;
  color: var(--muted);
}
.dica {
  font-size: 13.5px;
  margin: 0 0 10px;
}
.erro {
  color: var(--risk);
}
.abas {
  margin-bottom: 12px;
}
</style>
