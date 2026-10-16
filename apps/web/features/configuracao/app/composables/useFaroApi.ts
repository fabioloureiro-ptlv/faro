// Cliente da API do Faro. Erros chegam como { error, message, details } (services/api/src/app.ts).
import type { DySheet, Experiment, MetricDefinition, PageCatalog, AudienceShortcut, Template } from '@faro/contracts';
import type { DateSuggestion, MdeSuggestion } from '@faro/config-core';

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: { id?: string; path?: string; message?: string }[];
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: ApiErrorBody) {
    super(body.message);
  }
}

export interface ServerView {
  experiment: Experiment;
  derived: { eligibleDaily: number; designRegistered: boolean };
}

export interface ExperimentSummary {
  faroId: string;
  name: string;
  bu: Experiment['bu'];
  ownerSquad: string;
  status: Experiment['status'];
  legacy: boolean;
  updatedAt: string;
}

/** Testes rodando na DY, por área (BU), que vêm junto da sugestão de datas. */
export interface AreaRodando {
  bu: string;
  rotulo: string;
  quantidade: number;
  testes: { campanha: string; stream: 'web' | 'app'; status: string; inicio: string; fim: string; paginas: string[] }[];
}
export type DateSuggestionView = DateSuggestion & { rodandoPorArea?: AreaRodando[] };

export interface DyCampaignRow {
  campaignId: string;
  campaignName: string;
  labels: string[];
  variations: string[];
  platforms: string[];
  pages: string[];
  firstSeen: string;
  observedSplit: number[];
}

export interface PackageVerification {
  id: string;
  rotulo: string;
  status: 'ok' | 'erro' | 'aviso' | 'pulado';
  detalhe?: string;
}

export interface PackageCheck {
  ok: boolean;
  verificacoes: PackageVerification[];
  resumo?: { id: string; name: string; dyAttribute: string; share?: number; clientes?: number; gigabytes?: number; parameters: string[] };
}

export interface FaroEventRow {
  id: number;
  type: string;
  faroId: string;
  occurredAt: string;
  payload: {
    divergences?: { kind: string; message: string; refdate: string }[];
    slack?: { channel?: string };
    jira?: { key: string; url: string };
  };
}

/** Resposta de POST /experiments/:id/anunciar. */
export interface AnuncioResult {
  slack: { status: 'enviado' | 'nao_configurado' | 'falhou'; channel?: string };
  jira: { status: 'enviado' | 'nao_configurado' | 'falhou'; key?: string; url?: string };
  texto: string;
}

export function useFaroApi() {
  const cfg = useRuntimeConfig().public;
  const base = cfg.apiBase as string;
  const headers = { 'x-faro-user': cfg.faroUser as string };

  async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    try {
      return await $fetch<T>(`${base}${path}`, {
        method: (init.method ?? 'GET') as 'GET',
        headers,
        ...(init.body !== undefined ? { body: init.body as Record<string, unknown> } : {}),
      });
    } catch (e) {
      const err = e as { status?: number; data?: ApiErrorBody };
      throw new ApiError(err.status ?? 0, err.data ?? { error: 'rede', message: 'Não foi possível falar com a API do Faro.' });
    }
  }

  return {
    actor: cfg.faroUser as string,
    base,
    list: () => call<ExperimentSummary[]>('/experiments'),
    get: (id: string) => call<ServerView>(`/experiments/${id}`),
    create: (templateId?: string) => call<ServerView>('/experiments', { method: 'POST', body: templateId ? { templateId } : {} }),
    patch: (id: string, body: Record<string, unknown>) => call<ServerView>(`/experiments/${id}`, { method: 'PATCH', body }),
    ready: (id: string) => call<ServerView>(`/experiments/${id}/ready`, { method: 'POST', body: {} }),
    sheet: (id: string) => call<DySheet>(`/experiments/${id}/dy-sheet`),
    sheetMarkdownUrl: (id: string) => `${base}/experiments/${id}/dy-sheet?format=md`,
    confirm: (id: string, body: { campaignId: string; configuredBy: string; configuredAt: string }) =>
      call<ServerView>(`/experiments/${id}/dy-confirmation`, { method: 'POST', body }),
    duplicate: (id: string) => call<ServerView>(`/experiments/${id}/duplicate`, { method: 'POST', body: {} }),
    // Aviso do teste pronto: resumo no Slack e card no Jira com a ficha (quem configura o DY é uma pessoa).
    anunciar: (id: string) => call<AnuncioResult>(`/experiments/${id}/anunciar`, { method: 'POST', body: {} }),
    // Ajustes de produto 15/10: sugestão de datas (com testes interpostos) e de MDE (base histórica).
    dateSuggestion: (id: string) => call<DateSuggestionView>(`/experiments/${id}/date-suggestion`),
    mdeSuggestion: (id: string) => call<MdeSuggestion>(`/experiments/${id}/mde-suggestion`),
    importLegacy: (body: { dyCampaignId: string; bu: string; ownerSquad: string }) =>
      call<ServerView>('/experiments/import-legacy', { method: 'POST', body }),
    dyCampaigns: () => call<DyCampaignRow[]>('/experiments/dy-campaigns'),
    // Painel: roda de novo as queries da DY no BigQuery e atualiza os arquivos de dados.
    dyRefresh: () =>
      call<{ campanhas: number; testes: number; linhas: number; segundos: number; atualizadoEm: string }>('/painel/dy-refresh', {
        method: 'POST',
        body: {},
      }),
    events: (faroId: string) => call<FaroEventRow[]>(`/events?faroId=${encodeURIComponent(faroId)}`),
    metrics: () => call<MetricDefinition[]>('/catalog/metrics'),
    createMetric: (body: { name: string; kind: 'proportion' | 'mean'; definition: string; section?: string; baseline: number; stdDev?: number }) =>
      call<MetricDefinition>('/catalog/metrics', { method: 'POST', body }),
    pages: () => call<PageCatalog>('/catalog/pages'),
    shortcuts: () => call<AudienceShortcut[]>('/catalog/audiences'),
    // Frente 3: query de segmentação e estimativa do público-alvo. `params` são os valores dos
    // parâmetros do segmento (ex.: { dias_inadimplencia: 90 }); sem eles valem os padrões do catálogo.
    audienceSql: (id: string, params?: Record<string, number>) =>
      call<{ sql: string; source: string; values: Record<string, number> }>(
        `/publico/audiences/${encodeURIComponent(id)}/sql${params && Object.keys(params).length ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : ''}`,
      ),
    audienceEstimate: (id: string, run: boolean, params?: Record<string, number>) =>
      call<{ sql: string; gigabytes: number; clientes?: number; values: Record<string, number> }>(`/publico/audiences/${encodeURIComponent(id)}/estimate`, {
        method: 'POST',
        body: { run, ...(params ? { params } : {}) },
      }),
    // Tela /segmento: catálogo completo (com query e parâmetros).
    audiencesFull: () => call<(AudienceShortcut & { origem: string })[]>('/publico/audiences'),
    // Pacote de segmento (saída da skill criar-segmento-faro): conferir sem gravar, e adicionar ao catálogo.
    segmentPackageCheck: (pacote: unknown) => call<PackageCheck>('/publico/audiences/package/check', { method: 'POST', body: pacote }),
    segmentPackageAdd: (pacote: unknown) =>
      call<PackageCheck & { shortcut: AudienceShortcut }>('/publico/audiences/package', { method: 'POST', body: pacote }),
    templates: () => call<Template[]>('/templates'),
  };
}
