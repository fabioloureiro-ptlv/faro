// Cliente da API do Faro. Erros chegam como { error, message, details } (services/api/src/app.ts).
import type { DySheet, Experiment, MetricDefinition, PageCatalog, AudienceShortcut, Template } from '@faro/contracts';

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

export interface FaroEventRow {
  id: number;
  type: string;
  faroId: string;
  occurredAt: string;
  payload: { divergences?: { kind: string; message: string; refdate: string }[] };
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
    importLegacy: (body: { dyCampaignId: string; bu: string; ownerSquad: string }) =>
      call<ServerView>('/experiments/import-legacy', { method: 'POST', body }),
    dyCampaigns: () => call<DyCampaignRow[]>('/experiments/dy-campaigns'),
    events: (faroId: string) => call<FaroEventRow[]>(`/events?faroId=${encodeURIComponent(faroId)}`),
    metrics: () => call<MetricDefinition[]>('/catalog/metrics'),
    createMetric: (body: { name: string; kind: 'proportion' | 'mean'; definition: string; section?: string; baseline: number; stdDev?: number }) =>
      call<MetricDefinition>('/catalog/metrics', { method: 'POST', body }),
    pages: () => call<PageCatalog>('/catalog/pages'),
    shortcuts: () => call<AudienceShortcut[]>('/catalog/audiences'),
    // Frente 3 (ajuste de produto 14/10): query de segmentação e estimativa do público-alvo.
    audienceSql: (id: string) => call<{ sql: string; source: string }>(`/publico/audiences/${encodeURIComponent(id)}/sql`),
    audienceEstimate: (id: string, run: boolean) =>
      call<{ sql: string; gigabytes: number; clientes?: number }>(`/publico/audiences/${encodeURIComponent(id)}/estimate`, {
        method: 'POST',
        body: { run },
      }),
    // Tela /segmento: catálogo completo, preview de regra nova e aprovação.
    audiencesFull: () => call<(AudienceShortcut & { origem: string })[]>('/publico/audiences'),
    audiencePreview: (rule: unknown, run: boolean) =>
      call<{ sql: string; gigabytes: number; clientes?: number; share?: number }>('/publico/audiences/preview', {
        method: 'POST',
        body: { rule, run },
      }),
    audienceCreate: (body: { name: string; rule: unknown; clientes?: number; share?: number }) =>
      call<AudienceShortcut>('/publico/audiences', { method: 'POST', body }),
    templates: () => call<Template[]>('/templates'),
  };
}
