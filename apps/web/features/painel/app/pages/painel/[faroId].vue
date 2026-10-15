<script setup lang="ts">
import { computed } from 'vue';
import { useHead, useRoute } from '#imports';
import ExperimentoCabecalho from '~~/features/painel/app/components/detalhe/ExperimentoCabecalho.vue';
import ExperimentoDesign from '~~/features/painel/app/components/detalhe/ExperimentoDesign.vue';
import ExperimentoResultado from '~~/features/painel/app/components/detalhe/ExperimentoResultado.vue';
import ExperimentoAcoes from '~~/features/painel/app/components/detalhe/ExperimentoAcoes.vue';
import ExperimentoGovernanca from '~~/features/painel/app/components/detalhe/ExperimentoGovernanca.vue';
import ExperimentoLinhaDoTempo from '~~/features/painel/app/components/detalhe/ExperimentoLinhaDoTempo.vue';
import { useExperimento } from '~~/features/painel/app/composables/useExperimento';
import { usePainelStore } from '~~/features/painel/app/stores/painel';

const route = useRoute();
const faroId = computed(() => String(route.params.faroId ?? ''));

const { data, error, refresh, tags, missingDesign, norte, timeline, metric } = useExperimento(faroId);

useHead(() => ({ title: data.value ? `${data.value.experiment.name} · Faro` : 'Experimento · Faro' }));

const painelStore = usePainelStore();
// Depois de decidir/encerrar, recarrega o detalhe e invalida a lista em cache.
async function onChanged() {
  await refresh();
  await painelStore.load(true);
}

const notFound = computed(() => error.value?.statusCode === 404 || error.value?.statusCode === 400);
</script>

<template>
  <main class="pagina">
    <template v-if="error">
      <NuxtLink to="/painel" class="voltar">← Experimentos</NuxtLink>
      <p v-if="notFound" role="alert">Não encontramos o experimento {{ faroId }}.</p>
      <p v-else role="alert" class="erro">
        Não foi possível carregar o experimento.
        <button type="button" @click="refresh()">Tentar de novo</button>
      </p>
    </template>

    <template v-else-if="data">
      <ExperimentoCabecalho :experiment="data.experiment" :tags="tags" />
      <!-- O teste nunca aparece sem o porquê: design no topo (contexto, seção 11). -->
      <div class="grade">
        <div class="principal">
          <ExperimentoDesign :experiment="data.experiment" :missing="missingDesign" :metric="metric" />
          <ExperimentoResultado
            :experiment="data.experiment"
            :rows="norte"
            :health="data.health"
            :metric="metric"
          />
        </div>
        <aside class="lateral">
          <ExperimentoAcoes
            :experiment="data.experiment"
            :actions="data.actions"
            :closing="data.closing"
            @changed="onChanged"
          />
          <ExperimentoGovernanca
            :alerts="data.alerts"
            :overlap="data.experiment.overlap ?? []"
            :related="data.related"
          />
          <ExperimentoLinhaDoTempo :items="timeline" />
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.pagina {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.voltar {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.erro {
  color: var(--risk);
}
.grade {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.principal,
.lateral {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
@media (max-width: 900px) {
  .grade {
    grid-template-columns: 1fr;
  }
}
</style>
