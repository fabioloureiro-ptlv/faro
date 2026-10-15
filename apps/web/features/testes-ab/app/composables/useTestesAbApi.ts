// Cliente da API da aba Teste AB. Erros chegam como { error, message } (services/api/src/app.ts).
import type { ConsultasView, DetalheDy, Grao, ListaDy, Resumo, RoadmapView, StreamFiltro } from './types';

export function useTestesAbApi() {
  const cfg = useRuntimeConfig().public;
  const headers = { 'x-faro-user': cfg.faroUser as string };
  const get = <T>(path: string, query?: Record<string, string | undefined>) =>
    $fetch<T>(`${cfg.apiBase}/testes-ab${path}`, { headers, query });

  return {
    resumo: () => get<Resumo>('/resumo'),
    roadmap: () => get<RoadmapView>('/roadmap'),
    dy: (q: { grao: Grao; stream: StreamFiltro; metrica?: string }) => get<ListaDy>('/dy', q),
    detalhe: (q: { campanha: string; stream: 'web' | 'app'; grao: Grao }) => get<DetalheDy>('/dy/detalhe', q),
    consultas: () => get<ConsultasView>('/consultas'),
    sql: (id: string) => $fetch<string>(`${cfg.apiBase}/testes-ab/consultas/${id}/sql`, { headers, responseType: 'text' }),
  };
}

/** Mensagem legível de um erro do $fetch (usa o `message` que a API manda). */
export function mensagemDeErro(e: unknown, padrao = 'Não foi possível carregar.'): string {
  const data = (e as { data?: { message?: string } })?.data;
  return data?.message ?? padrao;
}
