<script setup lang="ts">
import { computed } from 'vue';
import { useAsyncData, useHead } from '#imports';
import PainelNav from '~~/features/painel/app/components/PainelNav.vue';
import { usePainelStore } from '~~/features/painel/app/stores/painel';
import {
  CAPACITY_PLATFORMS,
  PLATFORM_LABEL,
  addDays,
  buildCapacity,
  formatDayMonth,
  type CapacityCell,
} from '~~/features/painel/app/domain';

useHead({ title: 'Capacidade · Faro' });

const store = usePainelStore();
await useAsyncData('painel', () => store.load());

// Mesmo "hoje" do mapa: dia seguinte ao D-1, igual no SSR e no navegador.
const view = computed(() =>
  store.data
    ? buildCapacity(store.data.experiments, store.data.pages, { today: addDays(store.data.asOf, 1) })
    : undefined,
);

const pct = (x: number) => `${Math.round(x * 100)}%`;
const nf = (n: number) => n.toLocaleString('pt-BR');
const TONE = { baixo: '', medio: 'warn', alto: 'risk' } as const;

function cellLabel(page: string, c: CapacityCell) {
  return `${page}, ${PLATFORM_LABEL[c.platform]}: ${pct(c.committed)} comprometido, ${c.active.length} ${
    c.active.length === 1 ? 'teste ativo' : 'testes ativos'
  }`;
}
</script>

<template>
  <main class="pagina">
    <header class="topo">
      <div>
        <h1>Capacidade</h1>
        <p class="sub">
          Quanto do tráfego de cada página e plataforma já está em teste hoje
          <template v-if="view">({{ formatDayMonth(view.today) }})</template>. Use para escolher onde testar.
        </p>
      </div>
      <PainelNav />
    </header>

    <p v-if="store.status === 'error'" role="alert" class="erro">
      {{ store.error }}
      <button type="button" @click="store.load(true)">Tentar de novo</button>
    </p>

    <template v-else-if="view">
      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Página</th>
              <th v-for="p in CAPACITY_PLATFORMS" :key="p" scope="col">{{ PLATFORM_LABEL[p] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in view.rows" :key="row.pageId">
              <th scope="row">{{ row.pageName }}</th>
              <td v-for="c in row.cells" :key="c.platform" :aria-label="cellLabel(row.pageName, c)">
                <div class="medida">
                  <div class="barra" aria-hidden="true">
                    <span :class="TONE[c.level]" :style="{ width: pct(c.committed) }" />
                  </div>
                  <strong :class="TONE[c.level]">{{ pct(c.committed) }}</strong>
                </div>
                <small v-if="c.freeDailyUsers !== undefined">~{{ nf(c.freeDailyUsers) }} usuários/dia livres</small>
                <ul v-if="c.active.length" class="testes">
                  <li v-for="t in c.active" :key="t.faroId">
                    <NuxtLink :to="`/painel/${t.faroId}`">{{ t.name }}</NuxtLink>
                    <span class="muted">
                      {{ pct(t.occupancy)
                      }}<template v-if="t.assumedFullAudience"> (público sem estimativa)</template>
                    </span>
                  </li>
                </ul>
                <p v-if="c.upcoming.length" class="chegando">
                  Chegando:
                  <template v-for="(u, i) in c.upcoming" :key="u.faroId">
                    {{ i ? ' · ' : '' }}<NuxtLink :to="`/painel/${u.faroId}`">{{ u.name }}</NuxtLink> ({{
                      formatDayMonth(u.startDate)
                    }})
                  </template>
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details class="como">
        <summary>Como o comprometido é calculado</summary>
        <p>
          Cada teste ocupa a fração <em>tráfego no teste × público elegível</em> dos usuários da página e
          plataforma. Testes do mesmo grupo de exclusão mútua dividem os usuários, então as frações somam.
          Entre testes independentes, o comprometido é a chance de um usuário cair em pelo menos um: 1 − Π(1 −
          fração). Contam os testes configurados no DY já iniciados, rodando e decididos (decidido ainda ocupa
          tráfego até ser desligado). "Chegando" lista os testes com design aprovado que começam nos próximos
          30 dias, até {{ formatDayMonth(view.horizonEnd) }}.
        </p>
      </details>
    </template>
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
.wrap {
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
  table-layout: fixed;
}
th,
td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  font-size: 14px;
}
thead th {
  font-size: 12.5px;
  color: var(--muted);
}
tbody th {
  width: 160px;
}
thead th:first-child {
  width: 160px;
}
tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
}
.medida {
  display: flex;
  align-items: center;
  gap: 8px;
}
.barra {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--line);
  overflow: hidden;
}
.barra span {
  display: block;
  height: 100%;
  background: var(--brand);
}
.barra span.warn {
  background: var(--warn);
}
.barra span.risk {
  background: var(--risk);
}
strong {
  min-width: 40px;
  text-align: right;
}
strong.warn {
  color: var(--warn);
}
strong.risk {
  color: var(--risk);
}
small,
.muted,
.chegando {
  color: var(--muted);
  font-size: 12.5px;
}
.testes {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.testes a,
.chegando a {
  color: var(--brand);
}
.chegando {
  margin: 6px 0 0;
}
.como {
  margin-top: 14px;
  color: var(--muted);
  font-size: 13.5px;
  max-width: 90ch;
}
.como summary {
  cursor: pointer;
  font-weight: 600;
}
</style>
