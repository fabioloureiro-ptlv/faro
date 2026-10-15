<script setup lang="ts">
import { useAsyncData, useHead } from '#imports';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import PainelFiltros from '~~/features/painel/app/components/PainelFiltros.vue';
import PainelTabela from '~~/features/painel/app/components/PainelTabela.vue';
import { usePainel } from '~~/features/painel/app/composables/usePainel';
import { formatDayMonth } from '~~/features/painel/app/domain';

useHead({ title: 'Experimentos · Faro' });

const painel = usePainel();
const { filters, rows, total, squads, pages, asOf, store } = painel;

await useAsyncData('painel', () => store.load());
</script>

<template>
  <main class="pagina">
    <header class="topo">
      <div>
        <h1>Experimentos</h1>
        <p v-if="asOf" class="sub">Status e leituras com dados até {{ formatDayMonth(asOf) }} (D-1).</p>
      </div>
      <PainelNav />
    </header>

    <p v-if="store.status === 'error'" role="alert" class="erro">
      {{ store.error }}
      <button type="button" @click="store.load(true)">Tentar de novo</button>
    </p>

    <template v-else>
      <PainelFiltros
        :filters="filters"
        :squads="squads"
        :pages="pages"
        :shown="rows.length"
        :total="total"
        @update="painel.update"
        @reset="painel.reset"
      />
      <PainelTabela
        :rows="rows"
        :filters="filters"
        :page-name="painel.pageName"
        :metric-name="painel.metricName"
        @sort="painel.toggleSort"
      />
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
.sub {
  margin: 4px 0 20px;
  color: var(--muted);
}
.erro {
  color: var(--risk);
}
</style>
