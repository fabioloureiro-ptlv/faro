// Dataset do painel (frente 2) no repo unificado: experimentos e eventos vêm do banco
// da frente 1; métricas, resultados e saúde vêm das fixtures (até a frente 4 produzir
// com data/models/results/dy_results.sql); campanhas vêm do export real do DY quando
// o sync já rodou (npm run job:sync-dy), senão da fixture.
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
import { evaluateGovernance, orphanAlerts } from './governance/index.ts';

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

function pagesFromCatalog(): PageDefinition[] {
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
  const experiments = await listExperiments(db);
  const linkedCampaigns = linkCampaigns(base.campaigns, experiments);
  const today = addDays(base.asOf, 1);
  return {
    experiments,
    metricResults: base.metricResults,
    metrics: base.metrics,
    pages: base.pages,
    health: base.health,
    linkedCampaigns,
    allCampaigns: base.campaigns,
    // DECISAO-PENDENTE: o alerta de órfã fica fora do motor geral enquanto o export
    // real não traz labels (todas as 2 mil campanhas seriam órfãs). A tela de órfãs
    // usa orphanAlerts sobre o export completo, com corte.
    alerts: evaluateGovernance({
      experiments,
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

/** Órfãs para a tela: campanhas ativas sem experimento, mais recentes primeiro (corte de 200). */
export function orphanItems(ds: PainelDataset): { campaign: DyCampaignStatus; alert: GovernanceAlert }[] {
  const linked = new Set(ds.linkedCampaigns.map((c) => c.campaignId));
  const candidates = ds.allCampaigns
    .filter((c) => c.active && !linked.has(c.campaignId))
    .sort((a, b) => (b.lastExposureDate ?? '').localeCompare(a.lastExposureDate ?? ''))
    .slice(0, 200);
  const alerts = orphanAlerts({
    experiments: ds.experiments,
    campaigns: candidates,
    norteResults: [],
    health: [],
    today: ds.today,
    experimentationTeam: EXPERIMENTATION_TEAM,
  });
  const byId = new Map(alerts.map((a) => [a.dyCampaignId!, a]));
  return candidates
    .map((campaign) => ({ campaign, alert: byId.get(campaign.campaignId) }))
    .filter((x): x is { campaign: DyCampaignStatus; alert: GovernanceAlert } => !!x.alert);
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
