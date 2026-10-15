// Rotas do painel (frente 2) na API unificada: lista, detalhe, órfãs, decisão e
// encerramento. Dados de experimento vêm do banco da frente 1; métricas/saúde das
// fixtures (até a frente 4); campanhas do export real do DY.
import type { FastifyInstance } from 'fastify';
import { FaroIdSchema } from '@faro/contracts';
import type { Experiment } from '@faro/contracts';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { requireActor } from '../http.ts';
import { appendEvent, getExperiment, updateExperiment } from '../experiments/repository.ts';
import { invalidateDyExportCache } from '../adapters/dy-export-file.ts';
import { syncDyCampaigns } from '../jobs/sync-dy-campaigns.ts';
import { invalidateResultsCache } from '../resultados/results.ts';
import { syncResults } from '../resultados/jobs/sync-results.ts';
import { buildDataset, buildTimelineEvents, DY_PSEUDO_PREFIX, invalidateStaticData } from './dataset.ts';
import { allowedTransitions, closeExperiment, closingChecklist, decideExperiment, type Actor, type CommandResult, type TransitionEvent } from './status/index.ts';
import { missingDesignFields } from './governance/index.ts';

const STATUS_BY_ERROR: Record<string, number> = {
  entrada_invalida: 400,
  sem_permissao: 403,
  somente_sistema: 403,
  transicao_invalida: 409,
  status_terminal: 409,
  decisao_obrigatoria: 409,
  decisao_invalida: 400,
  sem_exposicao: 409,
  checklist_incompleto: 409,
};

// DECISAO-PENDENTE: sem SSO não há squad/papel reais. Em dev todo usuário do header
// age como time de experimentação (senão ninguém decide teste de outro squad).
function actorFrom(email: string): Actor {
  return { kind: 'user', email, roles: ['experimentacao'] };
}

function parseFaroId(raw: unknown): string {
  const parsed = FaroIdSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'faro_id_invalido', 'faroId inválido.');
  return parsed.data;
}

async function applyCommand(db: Db, result: CommandResult): Promise<{ faroId: string; status: Experiment['status'] }> {
  if (!result.ok) {
    throw new HttpError(STATUS_BY_ERROR[result.error] ?? 400, result.error, result.message, {
      ...('checklist' in result ? { checklist: result.checklist } : {}),
    });
  }
  const exp = { ...result.experiment, updatedAt: new Date().toISOString() };
  await updateExperiment(db, exp);
  for (const ev of result.events as TransitionEvent[]) {
    const occurredAt = new Date().toISOString();
    if (ev.type === 'experiment.status_changed')
      await appendEvent(db, {
        type: 'experiment.status_changed',
        faroId: ev.faroId,
        actor: ev.actor,
        occurredAt,
        payload: { from: ev.from, to: ev.to, ...(ev.reason ? { reason: ev.reason } : {}) },
      });
    else
      await appendEvent(db, {
        type: 'experiment.decided',
        faroId: ev.faroId,
        actor: exp.decision?.decidedBy ?? 'system',
        occurredAt,
        payload: { decision: ev.decision },
      });
  }
  return { faroId: exp.faroId, status: exp.status };
}

// Atualização da DY sob demanda (ajuste de produto 15/10): roda de novo as duas
// queries no BigQuery (export de campanhas + dy_results) e invalida os caches.
// Cliques simultâneos entram na mesma execução em andamento (as queries são caras).
let refreshInFlight: Promise<{ campanhas: number; testes: number; linhas: number; segundos: number }> | undefined;

async function runDyRefresh() {
  const start = Date.now();
  const [dy, res] = await Promise.all([syncDyCampaigns(), syncResults()]);
  invalidateDyExportCache();
  invalidateResultsCache();
  invalidateStaticData();
  return { campanhas: dy.campaigns, testes: res.testes, linhas: res.linhas, segundos: Math.round((Date.now() - start) / 1000) };
}

export async function painelRoutes(app: FastifyInstance, db: Db) {
  app.post('/painel/dy-refresh', async (req) => {
    requireActor(req);
    try {
      refreshInFlight ??= runDyRefresh();
      return { ...(await refreshInFlight), atualizadoEm: new Date().toISOString() };
    } catch (e) {
      throw new HttpError(503, 'bigquery_indisponivel', `Não foi possível atualizar da DY: ${(e as Error).message}`);
    } finally {
      refreshInFlight = undefined;
    }
  });

  app.get('/painel', async (req) => {
    requireActor(req);
    const ds = await buildDataset(db);
    const primary = new Map(ds.experiments.map((e) => [e.faroId, e.design.primaryMetricId]));
    return {
      experiments: ds.experiments,
      norteResults: ds.metricResults.filter((r) => primary.get(r.faroId) === r.metricId),
      alerts: ds.alerts,
      pages: ds.pages,
      metrics: ds.metrics.map(({ id, name, direction }) => ({ id, name, direction })),
      asOf: ds.asOf,
    };
  });

  app.get<{ Params: { faroId: string } }>('/painel/experiments/:faroId', async (req) => {
    const actorEmail = requireActor(req);
    const faroId = parseFaroId(req.params.faroId);
    const ds = await buildDataset(db);
    const experiment = ds.experiments.find((e) => e.faroId === faroId);
    if (!experiment) throw new HttpError(404, 'nao_encontrado', 'Experimento não encontrado');

    const d = experiment.design;
    const metricIds = new Set([d.primaryMetricId, ...d.secondaryMetricIds, ...d.guardrailMetricIds]);
    const relatedIds = new Set((experiment.overlap ?? []).map((o) => o.otherFaroId));
    const actor = actorFrom(actorEmail);
    // Teste sintético do DY (não cadastrado): leitura apenas, sem comandos.
    const sintetico = faroId.startsWith(DY_PSEUDO_PREFIX);
    const allowed = sintetico ? [] : allowedTransitions(experiment, actor);
    const campaign = ds.linkedCampaigns.find((c) => c.labels.includes(`faro:${faroId}`));

    return {
      experiment,
      norteResults: ds.metricResults.filter((r) => r.faroId === faroId && r.metricId === d.primaryMetricId),
      health: ds.health.find((h) => h.faroId === faroId),
      events: await buildTimelineEvents(db, faroId),
      alerts: ds.alerts.filter((a) => a.faroId === faroId && !a.resolvedAt),
      metrics: ds.metrics.filter((m) => metricIds.has(m.id)),
      pages: ds.pages.filter((p) => experiment.allocation.pages.includes(p.id)),
      related: ds.experiments
        .filter((e) => relatedIds.has(e.faroId))
        .map(({ faroId, name, bu, status }) => ({ faroId, name, bu, status })),
      ...(experiment.status === 'decidido' ? { closing: closingChecklist(experiment, campaign) } : {}),
      actions: { actor: actorEmail, canDecide: allowed.includes('decidido'), canClose: allowed.includes('encerrado') },
      missingDesign: missingDesignFields(d),
    };
  });

  app.post<{ Params: { faroId: string } }>('/experiments/:faroId/decision', async (req) => {
    const actor = actorFrom(requireActor(req));
    const faroId = parseFaroId(req.params.faroId);
    const experiment = await getExperiment(db, faroId);
    if (!experiment) throw new HttpError(404, 'nao_encontrado', 'Experimento não encontrado');
    return applyCommand(db, decideExperiment(experiment, req.body, { actor, now: new Date().toISOString() }));
  });

  app.post<{ Params: { faroId: string } }>('/experiments/:faroId/close', async (req) => {
    const actor = actorFrom(requireActor(req));
    const faroId = parseFaroId(req.params.faroId);
    const experiment = await getExperiment(db, faroId);
    if (!experiment) throw new HttpError(404, 'nao_encontrado', 'Experimento não encontrado');
    const ds = await buildDataset(db);
    const campaign = ds.linkedCampaigns.find((c) => c.labels.includes(`faro:${faroId}`));
    return applyCommand(db, closeExperiment(experiment, req.body, { actor, now: new Date().toISOString(), campaign }));
  });
}
