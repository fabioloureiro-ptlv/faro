<script setup lang="ts">
import { ref } from 'vue';
import { useAsyncData, useHead } from '#imports';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import PainelFiltros from '~~/features/painel/app/components/PainelFiltros.vue';
import PainelTabela from '~~/features/painel/app/components/PainelTabela.vue';
import { usePainel } from '~~/features/painel/app/composables/usePainel';
import { formatDayMonth } from '~~/features/painel/app/domain';
import { ApiError, useFaroApi } from '~~/features/configuracao/app/composables/useFaroApi';

useHead({ title: 'Acompanhamento de Experimentos' });

const painel = usePainel();
const { filters, rows, total, squads, pages, asOf, store } = painel;

await useAsyncData('painel', () => store.load());

// Ajuste de produto 15/10: a atualização da DY mora aqui no Painel — roda de novo
// as queries no BigQuery (export + dy_results) e recarrega a lista.
const api = useFaroApi();
const refreshBusy = ref(false);
const refreshMsg = ref('');
const refreshErr = ref('');

async function atualizarDy() {
  refreshBusy.value = true;
  refreshMsg.value = '';
  refreshErr.value = '';
  try {
    const r = await api.dyRefresh();
    await store.load(true);
    refreshMsg.value = `Atualizado: ${r.campanhas} campanhas e ${r.testes} testes com resultado (${r.segundos}s).`;
  } catch (e) {
    refreshErr.value = e instanceof ApiError ? e.message : 'Não foi possível atualizar da DY.';
  } finally {
    refreshBusy.value = false;
  }
}
</script>

<template>
  <main class="pagina">
    <header class="topo">
      <div>
        <h1>Experimentos</h1>
        <p v-if="asOf" class="sub">Status e leituras com dados até {{ formatDayMonth(asOf) }} (D-1).</p>
      </div>
      <div class="direita">
        <PainelNav />
        <button type="button" class="atualizar" :disabled="refreshBusy" @click="atualizarDy">
          {{ refreshBusy ? 'Atualizando… (as queries levam ~2 min)' : 'Atualizar da DY' }}
        </button>
      </div>
    </header>

    <p v-if="refreshErr" role="alert" class="erro">{{ refreshErr }}</p>
    <p v-else-if="refreshMsg" role="status" class="ok">{{ refreshMsg }}</p>

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
.ok {
  color: var(--ok, #157f3d);
  font-size: 13.5px;
}
.direita {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.atualizar {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
}
.atualizar:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
