<script setup lang="ts">
import { computed } from 'vue';
import { useAsyncData, useHead } from '#imports';
import PainelMapa from '~~/features/painel/app/components/PainelMapa.vue';
import PainelBuTabs from '~~/features/painel/app/components/PainelBuTabs.vue';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import { usePainel } from '~~/features/painel/app/composables/usePainel';
import { BU_LABEL, addDays, buildTimeMap, formatDayMonth } from '~~/features/painel/app/domain';

useHead({ title: 'Mapa temporal · Faro' });

const painel = usePainel();
const { filters, store } = painel;

await useAsyncData('painel', () => store.load());

// Hoje = dia seguinte ao dado mais recente (D-1): igual no SSR e no navegador.
const map = computed(() =>
  store.data
    ? buildTimeMap(store.data.experiments, store.data.pages, {
        bu: filters.value.bu,
        today: addDays(store.data.asOf, 1),
        ...(filters.value.from ? { from: filters.value.from } : {}),
        ...(filters.value.to ? { to: filters.value.to } : {}),
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
          Testes por página de {{ formatDayMonth(map.start) }} a {{ formatDayMonth(map.end) }}. Clique numa
          barra para ver o teste.
        </p>
      </div>
      <PainelNav />
    </header>

    <p v-if="store.status === 'error'" role="alert" class="erro">
      {{ store.error }}
      <button type="button" @click="store.load(true)">Tentar de novo</button>
    </p>

    <template v-else-if="map">
      <PainelBuTabs :bu="filters.bu" class="abas" @select="(bu) => painel.update({ bu })" />
      <p v-if="filters.bu !== 'todas'" class="dica">
        Testes de outras BUs aparecem esmaecidos quando cruzam um teste de {{ BU_LABEL[filters.bu] }} na mesma
        página.
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
