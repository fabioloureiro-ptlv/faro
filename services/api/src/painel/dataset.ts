// Dataset do painel (frente 2) no repo unificado: experimentos e eventos vêm do banco
// da frente 1; métricas e saúde vêm das fixtures; a NORTE real e os testes descobertos no DY
// vêm do snapshot das consultas do roadmap (frente 4, resultados/roadmap) quando ele existe;
// campanhas vêm do export real do DY quando o sync já rodou (npm run job:sync-dy), senão da fixture.
import {
  DyCampaignStatusSchema,
  ExperimentHealthSchema,
  MetricDefinitionSchema,
  MetricResultSchema,
  PageCatalogSchema,
  type DyCampaignStatus,
  type Experiment,
  type ExperimentAuditEvent,
  type ExperimentHealth,
  type GovernanceAlert,
  type MetricDefinition,
  type MetricResult,
  type PageDefinition,
  type Platform,
} from '@faro/contracts';
import metricsCatalog from '@faro/contracts/fixtures/metrics-catalog.json' with { type: 'json' };
import metricResults from '@faro/contracts/fixtures/metric-results.json' with { type: 'json' };
import experimentHealth from '@faro/contracts/fixtures/experiment-health.json' with { type: 'json' };
import pageCatalog from '@faro/contracts/fixtures/pages.json' with { type: 'json' };
import dyCampaignsFixture from '@faro/contracts/fixtures/dy-campaigns.json' with { type: 'json' };
import { DY_EXPORT_PATH, fileDyExport, hasDyExportFile } from '../adapters/dy-export-file.ts';
import { readFileSync } from 'node:fs';
import type { Db } from '../db/client.ts';
import { listAudit, listEvents, listExperiments } from '../experiments/repository.ts';
import { realMetricResults } from '../resultados/results.ts';
import { DISCOVERED_PREFIX, discoverExperiments } from '../resultados/roadmap/adapter.ts';
import { getResultsSource } from '../resultados/roadmap/source.ts';
import { evaluateGovernance } from './governance/index.ts';

// DECISAO-PENDENTE: dono dos alertas sem squad (órfãs) até o time definir.
export const EXPERIMENTATION_TEAM = 'time-experimentacao@example.com';

export interface PainelDataset {
  experiments: Experiment[];
  metricResults: MetricResult[];
  metrics: MetricDefinition[];
  pages: PageDefinition[];
  health: ExperimentHealth[];
  /** Campanhas vinculadas a experimentos (labels `faro:` sintetizados pelo campaignId). */
  linkedCampaigns: DyCampaignStatus[];
  /** Todas as campanhas ativas do export (para a tela de órfãs). */
  allCampaigns: DyCampaignStatus[];
  alerts: GovernanceAlert[];
  asOf: string;
  today: string;
}

interface StaticData {
  metricResults: MetricResult[];
  metrics: MetricDefinition[];
  pages: PageDefinition[];
  health: ExperimentHealth[];
  campaigns: DyCampaignStatus[];
  asOf: string;
}

let cached: StaticData | undefined;

/** Após o sync da DY (POST /painel/dy-refresh), o dataset estático é relido do disco. */
export function invalidateStaticData(): void {
  cached = undefined;
}

export function pagesFromCatalog(): PageDefinition[] {
  const catalog = PageCatalogSchema.parse(pageCatalog);
  const platforms = Object.entries(catalog.platformShare) as [Platform, number][];
  return catalog.pages.map((p) => ({
    id: p.id,
    name: p.name,
    dailyUsers: p.dailyUsers,
    dailyUsersByPlatform: Object.fromEntries(platforms.map(([k, share]) => [k, Math.round(p.dailyUsers * share)])),
  }));
}

/** Campanhas do export real: ativa = com snapshot nos últimos 2 dias da janela. */
function campaignsFromExport(): { campaigns: DyCampaignStatus[]; asOf: string } | undefined {
  if (!hasDyExportFile()) return undefined;
  const port = fileDyExport();
  const meta = port.meta();
  const raw = JSON.parse(readFileSync(DY_EXPORT_PATH, 'utf-8')) as {
    campaigns: { campaignId: string; campaignName: string; firstSeen: string }[];
    snapshots: { campaignId: string; refdate: string }[];
  };
  const lastByCampaign = new Map<string, string>();
  for (const s of raw.snapshots) {
    const cur = lastByCampaign.get(s.campaignId);
    if (!cur || s.refdate > cur) lastByCampaign.set(s.campaignId, s.refdate);
  }
  const cutoff = new Date(meta.windowEnd);
  cutoff.setDate(cutoff.getDate() - 1);
  const activeFrom = cutoff.toISOString().slice(0, 10);
  const campaigns = raw.campaigns.map((c) => {
    const last = lastByCampaign.get(c.campaignId) ?? null;
    return DyCampaignStatusSchema.parse({
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      labels: [], // o export não traz labels do console (PEDIDOS #3)
      active: !!last && last >= activeFrom,
      lastExposureDate: last,
      asOf: meta.windowEnd,
    });
  });
  return { campaigns, asOf: meta.windowEnd };
}

function loadStatic(): StaticData {
  if (cached) return cached;
  const fromExport = campaignsFromExport();
  cached = {
    metricResults: (metricResults as { items: unknown[] }).items.map((r) => MetricResultSchema.parse(r)),
    metrics: (metricsCatalog as unknown[]).map((m) => MetricDefinitionSchema.parse(m)),
    pages: pagesFromCatalog(),
    health: (experimentHealth as { items: unknown[] }).items.map((h) => ExperimentHealthSchema.parse(h)),
    campaigns:
      fromExport?.campaigns ??
      (dyCampaignsFixture as { items: unknown[] }).items.map((c) => DyCampaignStatusSchema.parse(c)),
    asOf: fromExport?.asOf ?? '2026-10-13',
  };
  return cached;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Prefixo dos testes descobertos no DY (não cadastrados no Faro): convenção compartilhada com a frente 4. */
export const DY_PSEUDO_PREFIX = DISCOVERED_PREFIX;

/** Mapeia o primeiro segmento da URL do export para o catálogo de páginas. */
function pageFromSegment(seg: string): string | undefined {
  const s = seg.toLowerCase();
  if (s === 'home' || s === '') return 'home';
  if (s.includes('busca') || s.includes('search')) return 'busca';
  if (s.includes('carrinho') || s.includes('cart')) return 'carrinho';
  if (s.includes('checkout')) return 'checkout';
  if (s.includes('saude') || s.includes('plano')) return 'saude';
  if (s.includes('conta')) return 'conta';
  if (['cachorro', 'gato', 'gatos', 'passaros', 'roedores', 'peixes', 'repteis'].includes(s)) return 'pdp';
  return undefined;
}

/** Páginas por campanha, do export real do DY (casa pelo nome da campanha, sem caixa). Sem export, vazio. */
export function paginasDoExportDy(): Map<string, { campaignId: string; pages: string[] }> {
  const out = new Map<string, { campaignId: string; pages: string[] }>();
  try {
    const raw = JSON.parse(readFileSync(DY_EXPORT_PATH, 'utf-8')) as {
      campaigns: { campaignId: string; campaignName: string; pages: string[] }[];
    };
    for (const c of raw.campaigns) {
      const pages = [...new Set(c.pages.map(pageFromSegment).filter((p): p is string => !!p))];
      out.set(c.campaignName.trim().toLowerCase(), { campaignId: c.campaignId, pages });
    }
  } catch {
    /* sem export: segue sem páginas */
  }
  return out;
}

/**
 * Ajuste de produto (15/10): os testes A/B realmente ativos no DY (snapshot das consultas do
 * roadmap, 2–6 variantes, com exposição recente) aparecem na Lista e no Mapa temporal como
 * experimentos `FARO-0000-NNNN`, marcados como não cadastrados. A descoberta é da frente 4
 * (resultados/roadmap/adapter.ts); aqui só entram páginas e campaignId do export do DY.
 * "Programados para o futuro" não existe no export (DECISAO-PENDENTE: depende do cadastro no
 * Faro ou de agenda externa).
 */
function dyActiveExperiments(existing: Experiment[]): Experiment[] {
  const snap = getResultsSource().snapshot();
  if (!snap) return [];
  const found = discoverExperiments(snap, existing, { ownerEmail: EXPERIMENTATION_TEAM });
  if (!found.length) return found;
  const exportPages = paginasDoExportDy();
  return found.map((e) => {
    const exp = exportPages.get(e.name.trim().toLowerCase());
    if (!exp) return e;
    const pages = exp.pages;
    return { ...e, allocation: { ...e.allocation, pages }, dy: { campaignName: e.name, labels: [], ...e.dy, campaignId: exp.campaignId } };
  });
}

/** Sintetiza o label `faro:` nas campanhas vinculadas por campaignId (o export real não traz labels). */
function linkCampaigns(campaigns: DyCampaignStatus[], experiments: Experiment[]): DyCampaignStatus[] {
  const byCampaign = new Map(
    experiments.filter((e) => e.dy?.campaignId).map((e) => [e.dy!.campaignId!, e.faroId]),
  );
  return campaigns
    .filter((c) => byCampaign.has(c.campaignId))
    .map((c) => ({ ...c, labels: [...c.labels, `faro:${byCampaign.get(c.campaignId)!}`] }));
}

export async function buildDataset(db: Db): Promise<PainelDataset> {
  const base = loadStatic();
  const registered = await listExperiments(db);
  // Testes ativos no DY sem cadastro aparecem na Lista e no Mapa (FARO-0000-…).
  const dyActive = dyActiveExperiments(registered);
  const experiments = [...registered, ...dyActive];
  const linkedCampaigns = linkCampaigns(base.campaigns, experiments);
  const today = addDays(base.asOf, 1);
  // Frente 4: quando o sync de resultados já rodou, os números reais substituem a
  // fixture para os testes vinculáveis; os demais seguem com a fixture.
  let metricResults = base.metricResults;
  const snap = getResultsSource().snapshot();
  if (snap) {
    const real = realMetricResults(experiments, snap);
    const covered = new Set(real.map((r) => r.faroId));
    metricResults = [...base.metricResults.filter((r) => !covered.has(r.faroId)), ...real];
  }
  return {
    experiments,
    metricResults,
    metrics: base.metrics,
    pages: base.pages,
    health: base.health,
    linkedCampaigns,
    allCampaigns: base.campaigns,
    // Governança só sobre os testes cadastrados: os sintéticos do DY (FARO-0000-…)
    // não têm design por definição e inundariam os alertas.
    alerts: evaluateGovernance({
      experiments: registered,
      campaigns: linkedCampaigns,
      norteResults: base.metricResults,
      health: base.health,
      today,
      experimentationTeam: EXPERIMENTATION_TEAM,
    }),
    asOf: base.asOf,
    today,
  };
}

/** Linha do tempo do experimento a partir do outbox + auditoria da frente 1. */
export async function buildTimelineEvents(db: Db, faroId: string): Promise<ExperimentAuditEvent[]> {
  const [events, audit] = await Promise.all([listEvents(db, { faroId }), listAudit(db, faroId)]);
  const out: ExperimentAuditEvent[] = [];
  for (const ev of events) {
    const at = ev.occurredAt.slice(0, 10);
    if (ev.type === 'experiment.created')
      out.push({ type: 'experiment.created', faroId, actor: ev.actor, importedFromDy: ev.payload.legacy, at });
    else if (ev.type === 'experiment.design_completed')
      out.push({ type: 'experiment.status_changed', faroId, from: 'rascunho', to: 'design_completo', actor: ev.actor, at });
    else if (ev.type === 'experiment.configured')
      out.push({
        type: 'experiment.status_changed',
        faroId,
        from: ev.payload.previousStatus,
        to: 'configurado_no_dy',
        actor: ev.actor,
        at,
      });
    else if (ev.type === 'experiment.status_changed')
      out.push({ type: 'experiment.status_changed', faroId, from: ev.payload.from, to: ev.payload.to, actor: ev.actor, ...(ev.payload.reason ? { reason: ev.payload.reason } : {}), at });
    else if (ev.type === 'experiment.decided')
      out.push({ type: 'experiment.decided', faroId, decision: ev.payload.decision, at });
  }
  for (const a of audit)
    out.push({ type: 'experiment.design_changed', faroId, actor: a.author, fields: [a.field], at: a.at.slice(0, 10) });
  return out;
}
