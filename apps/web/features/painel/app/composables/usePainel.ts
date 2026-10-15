import { computed } from 'vue';
import { useRoute, useRouter } from '#imports';
import {
  DEFAULT_FILTERS,
  applyFilters,
  buildRows,
  filtersToQuery,
  parseFilters,
  type PainelFilters,
  type Query,
  type SortKey,
} from '../domain';
import { usePainelStore } from '../stores/painel';

export function usePainel() {
  const store = usePainelStore();
  const route = useRoute();
  const router = useRouter();

  const filters = computed(() => parseFilters(route.query as Query));
  const allRows = computed(() => (store.data ? buildRows(store.data) : []));
  const rows = computed(() => applyFilters(allRows.value, filters.value));

  const squads = computed(() =>
    [...new Set(allRows.value.map((r) => r.experiment.ownerSquad))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    ),
  );
  const pages = computed(() => store.data?.pages ?? []);

  const pageNames = computed(() => new Map(pages.value.map((p) => [p.id, p.name])));
  const metricNames = computed(() => new Map((store.data?.metrics ?? []).map((m) => [m.id, m.name])));

  function update(patch: Partial<PainelFilters>) {
    return router.replace({ query: filtersToQuery({ ...filters.value, ...patch }) });
  }

  function toggleSort(key: SortKey) {
    const f = filters.value;
    return update(f.sort === key ? { dir: f.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: 'asc' });
  }

  function reset() {
    return update({ ...DEFAULT_FILTERS, sort: filters.value.sort, dir: filters.value.dir });
  }

  return {
    store,
    filters,
    rows,
    total: computed(() => allRows.value.length),
    squads,
    pages,
    asOf: computed(() => store.data?.asOf),
    pageName: (id: string) => pageNames.value.get(id) ?? id,
    metricName: (id: string) => metricNames.value.get(id) ?? id,
    update,
    toggleSort,
    reset,
  };
}
