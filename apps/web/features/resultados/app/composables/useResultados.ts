import { computed, type Ref } from 'vue';
import { useFetch, useRuntimeConfig } from '#imports';
import type { Grain, Platform, ResultsResponse } from '@faro/contracts';

export interface ResultadosQuery {
  platform: Ref<Platform | 'all'>;
  grain: Ref<Grain>;
}

/** GET /results/:faroId?platform=&grain= (frente 4, MET-14). Refaz a busca quando o recorte muda. */
export function useResultados(faroId: Ref<string>, query: ResultadosQuery) {
  const cfg = useRuntimeConfig().public;
  const url = computed(
    () =>
      `${cfg.apiBase}/results/${encodeURIComponent(faroId.value)}?platform=${query.platform.value}&grain=${query.grain.value}`,
  );
  const { data, error, status, refresh } = useFetch<ResultsResponse>(url, {
    key: computed(() => `resultados:${faroId.value}:${query.platform.value}:${query.grain.value}`),
    headers: { 'x-faro-user': cfg.faroUser as string },
  });
  return { data, error, status, refresh };
}
