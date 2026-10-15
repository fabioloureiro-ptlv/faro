<script setup lang="ts">
import { useFetch, useHead } from '#imports';
import type { DyCampaignStatus, GovernanceAlert } from '@faro/contracts';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import { formatDayMonth } from '~~/features/painel/app/domain';

useHead({ title: 'Campanhas órfãs · Faro' });

// Unificação: órfãs vêm da API Fastify, calculadas sobre o export real do DY.
const cfg = useRuntimeConfig().public;
const { data, error, refresh } = await useFetch<{
  asOf: string;
  items: { campaign: DyCampaignStatus; alert: GovernanceAlert }[];
}>(`${cfg.apiBase}/dy-campaigns/orphans`, { key: 'orfas', headers: { 'x-faro-user': cfg.faroUser as string } });
</script>

<template>
  <main class="pagina">
    <header class="topo">
      <div>
        <h1>Campanhas órfãs no DY</h1>
        <p class="sub">
          Campanhas ativas no Dynamic Yield sem experimento no Faro (sem label <code>faro:</code> ou com label
          de teste inexistente).
          <template v-if="data">Export de {{ formatDayMonth(data.asOf) }}.</template>
        </p>
      </div>
      <PainelNav />
    </header>

    <p v-if="error" role="alert" class="erro">
      Não foi possível carregar as campanhas.
      <button type="button" @click="refresh()">Tentar de novo</button>
    </p>

    <p v-else-if="data && data.items.length === 0" class="vazio">
      Nenhuma campanha órfã. Todas as campanhas ativas têm um experimento no Faro.
    </p>

    <div v-else-if="data" class="wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Campanha</th>
            <th scope="col">Labels no DY</th>
            <th scope="col">Última exposição</th>
            <th scope="col">Situação</th>
            <th scope="col"><span class="sr-only">Ação</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ campaign, alert } in data.items" :key="campaign.campaignId">
            <td>
              <strong>{{ campaign.campaignName }}</strong>
              <small>{{ campaign.campaignId }}</small>
            </td>
            <td>
              <template v-if="campaign.labels.length">
                <span v-for="l in campaign.labels" :key="l" class="chip chip--muted">{{ l }}</span>
              </template>
              <span v-else class="muted">nenhum</span>
            </td>
            <td>{{ campaign.lastExposureDate ? formatDayMonth(campaign.lastExposureDate) : '—' }}</td>
            <td>
              {{ alert.message }}
              <small>Dono: {{ alert.owner }}</small>
            </td>
            <td>
              <!-- CFG-14 é da frente 1 (pedido 3). O botão aparece para mostrar o caminho. -->
              <button type="button" disabled :aria-describedby="`motivo-${campaign.campaignId}`">
                Importar como legado
              </button>
              <small :id="`motivo-${campaign.campaignId}`">Disponível quando o cadastro (frente 1) liberar a importação.</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<style scoped>
.pagina {
  max-width: 1280px;
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
  max-width: 70ch;
}
.erro {
  color: var(--risk);
}
.vazio,
.muted {
  color: var(--muted);
}
.wrap {
  /* Posicionado para conter o .sr-only (absolute) do cabeçalho dentro da rolagem. */
  position: relative;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
  font-size: 14px;
}
th,
td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  font-size: 12.5px;
  color: var(--muted);
}
tbody tr:last-child td {
  border-bottom: 0;
}
td small {
  display: block;
  color: var(--muted);
  font-size: 12.5px;
  margin-top: 2px;
  overflow-wrap: anywhere;
}
.chip {
  margin: 0 4px 4px 0;
}
button {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
}
button:disabled {
  color: var(--muted);
  cursor: not-allowed;
}
</style>
