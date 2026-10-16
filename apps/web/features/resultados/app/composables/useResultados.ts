import { computed, type Ref } from 'vue';
import { useFetch, useRuntimeConfig } from '#imports';
import type { Grain, MetricDefinition, Platform, ResultsResponse } from '@faro/contracts';

export interface ResultadosQuery {
  platform: Ref<Platform | 'all'>;
  grain: Ref<Grain>;
}

/** De onde vêm os números: um experimento do Faro (faroId) ou uma campanha do DY (Visão Geral). */
export type FonteResultados =
  { kind: 'faro'; faroId: string } | { kind: 'dy'; campanha: string; stream: 'web' | 'app' };

export interface ResultadosCarregados {
  results: ResultsResponse;
  /** Métrica principal, quando a fonte a conhece (DY: do roadmap ou da consulta). */
  primaryMetricId?: string;
  norte?: Pick<MetricDefinition, 'id' | 'name' | 'unit' | 'direction'>;
}

/**
 * Busca o ResultsResponse da fonte e refaz quando o recorte muda.
 * - faro: GET /results/:faroId?platform=&grain= (frente 4, MET-14)
 * - dy:   GET /testes-ab/dy/resultado?campanha=&stream=&platform=&grain= (Visão Geral)
 */
export function useResultadosFonte(fonte: Ref<FonteResultados>, query: ResultadosQuery) {
  const cfg = useRuntimeConfig().public;
  const url = computed(() => {
    const f = fonte.value;
    const recorte = `platform=${query.platform.value}&grain=${query.grain.value}`;
    return f.kind === 'faro'
      ? `${cfg.apiBase}/results/${encodeURIComponent(f.faroId)}?${recorte}`
      : `${cfg.apiBase}/testes-ab/dy/resultado?campanha=${encodeURIComponent(f.campanha)}&stream=${f.stream}&${recorte}`;
  });
  const key = computed(() => {
    const f = fonte.value;
    const id = f.kind === 'faro' ? f.faroId : `${f.stream}|${f.campanha}`;
    return `resultados:${f.kind}:${id}:${query.platform.value}:${query.grain.value}`;
  });
  const { data, error, status, refresh } = useFetch<ResultadosCarregados>(url, {
    key,
    headers: { 'x-faro-user': cfg.faroUser as string },
    // O endpoint do Faro devolve o ResultsResponse puro; o do DY já vem embrulhado.
    transform: (raw: unknown): ResultadosCarregados => {
      const r = raw as { results?: { faroId?: string } } | null;
      const embrulhado = !!r && typeof r === 'object' && typeof r.results?.faroId === 'string';
      return (embrulhado ? r : { results: r }) as unknown as ResultadosCarregados;
    },
  });
  return { data, error, status, refresh };
}

/** Compatibilidade: experimento do Faro por faroId. */
export function useResultados(faroId: Ref<string>, query: ResultadosQuery) {
  const fonte = computed<FonteResultados>(() => ({ kind: 'faro', faroId: faroId.value }));
  const r = useResultadosFonte(fonte, query);
  return { ...r, data: computed(() => r.data.value?.results ?? null) };
}
