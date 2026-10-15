// Casos de uso da frente 1: rascunho, autosave, prontidão, ficha do DY, confirmação,
// legado e duplicação.
import { z } from 'zod';
import {
  AllocationSchema,
  AudienceSchema,
  BuSchema,
  DesignSchema,
  DyCampaignTypeSchema,
  type Experiment,
  type ExperimentStatus,
  type MetricDefinition,
  type FaroEvent,
  type OverlapDecision,
} from '@faro/contracts';
import {
  audienceChecks,
  blankDraft,
  buildDySheet,
  campaignName,
  draftFromTemplate,
  duplicateDraft,
  dyLabels,
  effectiveBaseline,
  estimateDuration,
  evaluateDesignGate,
  isPreDy,
  overlapCheck,
  sampleSizePerGroup,
  statusAfterSave,
  suggestCampaignType,
  suggestDates,
  suggestMde,
  unlockedSteps,
  type DraftFields,
  type HistoricalEffect,
} from '@faro/config-core';
import type { Db } from '../db/client.ts';
import type { Ports } from '../ports.ts';
import { HttpError } from '../errors.ts';
import { buildDataset } from '../painel/dataset.ts';
import { busyWindows } from './busy.ts';
import {
  appendAudit,
  appendEvent,
  findByCampaignId,
  getExperiment,
  hasEvent,
  insertExperiment,
  listExperiments,
  nextFaroId,
  updateExperiment,
  type Tx,
} from './repository.ts';

// ---------------------------------------------------------------- entradas (validadas na borda)

export const CreateInputSchema = z.object({ templateId: z.string().optional() }).strict();

export const PatchInputSchema = z
  .object({
    name: z.string().max(140),
    bu: BuSchema,
    ownerSquad: z.string().max(80),
    design: DesignSchema,
    audience: AudienceSchema,
    allocation: AllocationSchema,
    overlapResolutions: z.array(
      z.object({ otherFaroId: z.string(), resolution: z.enum(['exclusao_mutua', 'paralelo', 'reagendar']).nullable() }),
    ),
    dy: z.object({ campaignType: DyCampaignTypeSchema.optional(), selector: z.string().max(120).optional() }).strict(),
  })
  .partial()
  .strict();
export type PatchInput = z.infer<typeof PatchInputSchema>;

export const ConfirmInputSchema = z
  .object({
    campaignId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Use só letras, números, - e _.'),
    configuredBy: z.string().trim().min(3).max(120),
    configuredAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const ImportLegacyInputSchema = z
  .object({ dyCampaignId: z.string().trim().min(1).max(64), bu: BuSchema, ownerSquad: z.string().trim().min(2).max(80) })
  .strict();

// ---------------------------------------------------------------- serviço

/** Comparação estável: o JSONB do Postgres não preserva a ordem das chaves. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}
const changed = (a: unknown, b: unknown) => canonical(a) !== canonical(b);

const DY_LINKED: ExperimentStatus[] = ['pronto_para_configurar', 'configurado_no_dy', 'rodando', 'decidido'];
/** Testes com leitura para servir de base histórica (sugestão de MDE). */
const WITH_RESULTS: ExperimentStatus[] = ['rodando', 'decidido', 'encerrado'];
/** Campos auditados após configurado_no_dy (requisito não funcional de auditoria). */
const AUDITED = ['name', 'bu', 'ownerSquad', 'audience', 'allocation'] as const;

export type ExperimentService = ReturnType<typeof createExperimentService>;

export function createExperimentService(db: Db, ports: Ports) {
  const nowIso = () => ports.now().toISOString();
  const event = <T extends FaroEvent['type']>(type: T, faroId: string, actor: string, payload: Extract<FaroEvent, { type: T }>['payload']) =>
    ({ type, faroId, actor, occurredAt: nowIso(), payload }) as FaroEvent;

  async function mustGet(tx: Tx, faroId: string): Promise<Experiment> {
    const e = await getExperiment(tx, faroId);
    if (!e) throw new HttpError(404, 'nao_encontrado', `Experimento ${faroId} não encontrado.`);
    return e;
  }

  /**
   * Tudo o que o wizard mostra além do próprio experimento. O catálogo é carregado antes de
   * abrir transação: o PGlite tem conexão única e uma consulta fora da transação travaria.
   */
  async function derive(exp: Experiment, catalog: MetricDefinition[]) {
    const gate = evaluateDesignGate(exp, new Set(catalog.map((m) => m.id)));
    const metric = catalog.find((m) => m.id === exp.design.primaryMetricId);
    const sampleInput = metric
      ? { metric, mdeRelative: exp.design.mdeRelative, ...(exp.design.baselineOverride != null ? { baselineOverride: exp.design.baselineOverride } : {}) }
      : null;
    const nPerGroup = sampleInput ? sampleSizePerGroup(sampleInput) : null;
    const eligibleDaily = await ports.audience.estimateEligibleDaily(exp.allocation, exp.audience);
    const duration = estimateDuration({
      nPerGroup,
      eligibleDaily,
      split: exp.allocation.split,
      startDate: exp.allocation.startDate,
      endDate: exp.allocation.endDate,
    });
    const audience = audienceChecks(exp);
    const overlap = overlapCheck(exp);
    return {
      gate,
      /** Teste legado cujo design ainda não passou no gate (CFG-14). */
      designRegistered: !(exp.legacy && !gate.complete),
      sample: { nPerGroup, baseline: sampleInput ? (effectiveBaseline(sampleInput) ?? null) : null, metricKind: metric?.kind ?? null },
      eligibleDaily,
      duration,
      audienceChecks: audience,
      overlapCheck: overlap,
      unlockedSteps: unlockedSteps(gate, audience, overlap),
      ready: gate.complete && audience.every((c) => c.ok) && overlap.ok,
    };
  }
  type Derived = Awaited<ReturnType<typeof derive>>;

  async function view(exp: Experiment) {
    return { experiment: exp, derived: await derive(exp, await ports.metrics.list()) };
  }

  /** Recalcula conflitos (frente 3) preservando decisões já tomadas. */
  async function refreshOverlaps(tx: Tx, exp: Experiment): Promise<OverlapDecision[] | undefined> {
    const a = exp.allocation;
    if (!a.startDate || !a.endDate || !a.pages.length || !a.platforms.length) return exp.overlap;
    const others = await listExperiments(tx);
    const fresh = await ports.overlap.listOverlaps(exp, others);
    const prev = new Map((exp.overlap ?? []).map((o) => [o.otherFaroId, o]));
    return fresh.map((o) => {
      const p = prev.get(o.otherFaroId);
      return p?.resolution ? { ...o, resolution: p.resolution, decidedBy: p.decidedBy, decidedAt: p.decidedAt } : o;
    });
  }

  async function insertNew(tx: Tx, catalog: MetricDefinition[], fields: DraftFields, actor: string, legacyStatus?: ExperimentStatus) {
    const now = nowIso();
    const faroId = await nextFaroId(tx, ports.now().getUTCFullYear());
    const draft: Experiment = { ...fields, faroId, status: 'rascunho', createdAt: now, updatedAt: now };
    const gate = evaluateDesignGate(draft, new Set(catalog.map((m) => m.id)));
    draft.status = legacyStatus ?? statusAfterSave('rascunho', gate.complete, false);
    await insertExperiment(tx, draft);
    await appendEvent(tx, event('experiment.created', faroId, actor, { name: draft.name, legacy: !!draft.legacy, ...(draft.templateId ? { templateId: draft.templateId } : {}) }));
    if (gate.complete) await appendEvent(tx, event('experiment.design_completed', faroId, actor, { primaryMetricId: draft.design.primaryMetricId }));
    return draft;
  }

  return {
    derive,

    async list() {
      const all = await listExperiments(db);
      return all.map((e) => ({
        faroId: e.faroId,
        name: e.name,
        bu: e.bu,
        ownerSquad: e.ownerSquad,
        status: e.status,
        legacy: !!e.legacy,
        updatedAt: e.updatedAt,
      }));
    },

    async get(faroId: string) {
      return view(await mustGet(db, faroId));
    },

    /** CFG-10: faroId gerado ao salvar o primeiro rascunho. */
    async create(input: z.infer<typeof CreateInputSchema>, actor: string) {
      let fields = blankDraft({ ownerEmail: actor });
      if (input.templateId) {
        const tpl = await ports.templates.get(input.templateId);
        if (!tpl) throw new HttpError(422, 'template_inexistente', 'Template não encontrado.');
        fields = draftFromTemplate(tpl, { ownerEmail: actor });
      }
      const catalog = await ports.metrics.list();
      const exp = await db.transaction((tx) => insertNew(tx, catalog, fields, actor));
      return view(exp);
    },

    /** Autosave (CFG-01). faroId e status não são editáveis. */
    async patch(faroId: string, raw: unknown, actor: string) {
      if (raw && typeof raw === 'object') {
        if ('faroId' in raw && (raw as { faroId: unknown }).faroId !== faroId)
          throw new HttpError(400, 'faro_id_imutavel', 'O faroId é imutável.');
        if ('status' in raw) throw new HttpError(400, 'status_nao_editavel', 'O status muda pelas ações do fluxo, não por edição.');
        delete (raw as { faroId?: unknown }).faroId;
      }
      const input = PatchInputSchema.parse(raw);
      const catalog = await ports.metrics.list();

      const result = await db.transaction(async (tx) => {
        const before = await mustGet(tx, faroId);
        if (before.status === 'encerrado' || before.status === 'cancelado')
          throw new HttpError(409, 'experimento_fechado', 'Experimento encerrado ou cancelado não pode ser editado.');
        const next: Experiment = structuredClone(before);
        if (input.name !== undefined) next.name = input.name;
        if (input.bu !== undefined) next.bu = input.bu;
        if (input.ownerSquad !== undefined) next.ownerSquad = input.ownerSquad;
        if (input.design) next.design = input.design;
        if (input.audience) next.audience = input.audience;
        if (input.allocation) next.allocation = input.allocation;
        if (input.dy) next.dy = { ...(next.dy ?? { campaignName: campaignName(next), labels: dyLabels(next) }), ...input.dy };

        if (isPreDy(next.status)) next.overlap = await refreshOverlaps(tx, next);
        for (const r of input.overlapResolutions ?? []) {
          const o = next.overlap?.find((x) => x.otherFaroId === r.otherFaroId);
          if (!o) throw new HttpError(422, 'conflito_inexistente', `Não há conflito com ${r.otherFaroId}.`);
          if (r.resolution) Object.assign(o, { resolution: r.resolution, decidedBy: actor, decidedAt: nowIso() });
          else {
            delete o.resolution;
            delete o.decidedBy;
            delete o.decidedAt;
          }
        }

        const d: Derived = await derive(next, catalog);
        if (!isPreDy(before.status) && !before.legacy && !d.gate.complete)
          throw new HttpError(422, 'design_incompleto', 'Depois de configurado no DY, o design precisa continuar completo.', d.gate.checks.filter((c) => !c.ok));
        next.status = statusAfterSave(before.status, d.gate.complete, d.ready);
        next.updatedAt = nowIso();
        await updateExperiment(tx, next);

        if (!isPreDy(before.status)) {
          const at = nowIso();
          const entries = [
            ...AUDITED.filter((k) => changed(before[k], next[k])).map((k) => ({ field: k, before: before[k], after: next[k] })),
            ...(Object.keys({ ...before.design, ...next.design }) as (keyof Experiment['design'])[])
              .filter((k) => changed(before.design[k], next.design[k]))
              .map((k) => ({ field: `design.${k}`, before: before.design[k] ?? null, after: next.design[k] ?? null })),
          ];
          await appendAudit(tx, entries.map((e) => ({ ...e, faroId, author: actor, at })));
        }
        if (d.gate.complete && !(await hasEvent(tx, faroId, 'experiment.design_completed')))
          await appendEvent(tx, event('experiment.design_completed', faroId, actor, { primaryMetricId: next.design.primaryMetricId }));
        return { experiment: next, derived: d };
      });
      return result;
    },

    /** Revisão concluída: revalida tudo e libera a ficha (pronto_para_configurar). */
    async ready(faroId: string) {
      const catalog = await ports.metrics.list();
      const exp = await db.transaction(async (tx) => {
        const exp = await mustGet(tx, faroId);
        if (!isPreDy(exp.status)) throw new HttpError(409, 'status_invalido', `Experimento em ${exp.status} não volta para a revisão.`);
        exp.overlap = await refreshOverlaps(tx, exp);
        const d = await derive(exp, catalog);
        const failing = [...d.gate.checks, ...d.audienceChecks, d.overlapCheck].filter((c) => !c.ok);
        if (failing.length) throw new HttpError(422, 'nao_pronto', 'Ainda há itens a resolver antes de gerar a ficha.', failing);
        const attr = await ports.audience.ensureDyAttribute(faroId, exp.audience);
        if (attr) exp.audience = { ...exp.audience, dyAttribute: attr };
        exp.dy = {
          ...exp.dy,
          campaignName: campaignName(exp),
          labels: dyLabels(exp),
          campaignType: exp.dy?.campaignType ?? suggestCampaignType(exp.allocation.platforms),
        };
        exp.status = 'pronto_para_configurar';
        exp.updatedAt = nowIso();
        await updateExperiment(tx, exp);
        return exp;
      });
      return view(exp);
    },

    /**
     * Ajuste de produto 15/10: sugestão de datas a partir da duração mínima (CFG-08),
     * com os testes interpostos (mesmas páginas e plataformas, ativos ou agendados).
     */
    async suggestDates(faroId: string) {
      const catalog = await ports.metrics.list();
      const exp = await mustGet(db, faroId);
      const d = await derive(exp, catalog);
      const a = exp.allocation;
      // Mesma base do Acompanhamento: os experimentos do Faro e os testes ativos que ele lê da DY.
      const ds = await buildDataset(db);
      const { busy, dy } = busyWindows({ experiments: ds.experiments, faroId, pages: a.pages, platforms: a.platforms, asOf: ds.asOf });
      return { ...suggestDates({ today: nowIso().slice(0, 10), durationDays: d.duration.durationDays, busy }), dy };
    },

    /**
     * Ajuste de produto 15/10: MDE sugerido pela base histórica — testes parecidos
     * (mesma NORTE) e o efeito que observaram. Resultados vêm do dataset da frente 4.
     */
    async suggestMde(faroId: string) {
      const exp = await mustGet(db, faroId);
      const metricId = exp.design.primaryMetricId;
      if (!metricId) throw new HttpError(422, 'sem_norte', 'Escolha a métrica primária antes de sugerir o efeito mínimo.');
      const ds = await buildDataset(db);
      const history: HistoricalEffect[] = ds.experiments
        .filter((o) => o.faroId !== faroId && WITH_RESULTS.includes(o.status))
        .flatMap((o) => {
          const rows = ds.metricResults.filter(
            (r) => r.faroId === o.faroId && r.metricId === metricId && r.platform === 'all' && r.grain === 'user' && r.deltaRelative != null,
          );
          if (!rows.length) return [];
          // Teste com mais de uma variante: vale a de maior efeito absoluto.
          const best = rows.reduce((x, y) => (Math.abs(y.deltaRelative!) > Math.abs(x.deltaRelative!) ? y : x));
          return [
            {
              faroId: o.faroId,
              name: o.name,
              metricId,
              deltaRelative: best.deltaRelative!,
              ...(best.label ? { label: best.label } : {}),
              pages: o.allocation.pages,
              bu: o.bu,
              platforms: o.allocation.platforms,
            },
          ];
        });
      return suggestMde({ metricId, pages: exp.allocation.pages, bu: exp.bu, platforms: exp.allocation.platforms, history });
    },

    /** CFG-11. */
    async dySheet(faroId: string) {
      const exp = await mustGet(db, faroId);
      if (!DY_LINKED.includes(exp.status))
        throw new HttpError(409, 'ficha_indisponivel', 'A ficha do DY fica disponível depois da revisão (pronto para configurar).');
      const pages = await ports.audience.pageCatalog();
      return buildDySheet(exp, { metric: await ports.metrics.get(exp.design.primaryMetricId), pages: pages.pages, generatedAt: nowIso() });
    },

    /** CFG-12. */
    async confirm(faroId: string, raw: unknown, actor: string) {
      const input = ConfirmInputSchema.parse(raw);
      const exp = await db.transaction(async (tx) => {
        const exp = await mustGet(tx, faroId);
        if (exp.status !== 'pronto_para_configurar')
          throw new HttpError(409, 'status_invalido', 'Só é possível confirmar a configuração de um experimento pronto para configurar.');
        const other = await findByCampaignId(tx, input.campaignId);
        if (other) throw new HttpError(409, 'campanha_em_uso', `A campanha ${input.campaignId} já está ligada a ${other.faroId}.`);
        exp.dy = { ...exp.dy!, campaignId: input.campaignId, configuredBy: input.configuredBy, configuredAt: input.configuredAt };
        exp.status = 'configurado_no_dy';
        exp.updatedAt = nowIso();
        await updateExperiment(tx, exp);
        await appendEvent(tx, event('experiment.configured', faroId, actor, { ...input, previousStatus: 'pronto_para_configurar' }));
        return exp;
      });
      return view(exp);
    },

    /** CFG-15. */
    async duplicate(faroId: string, actor: string) {
      const catalog = await ports.metrics.list();
      const exp = await db.transaction(async (tx) => insertNew(tx, catalog, duplicateDraft(await mustGet(tx, faroId), { ownerEmail: actor }), actor));
      return view(exp);
    },

    /** Campanhas do export do DY disponíveis para importação (plano, etapa 8). */
    async listDyCampaigns() {
      return ports.dyExport.listCampaigns();
    },

    /** CFG-14. */
    async importLegacy(raw: unknown, actor: string) {
      const input = ImportLegacyInputSchema.parse(raw);
      const c = await ports.dyExport.getCampaign(input.dyCampaignId);
      if (!c) throw new HttpError(404, 'campanha_nao_encontrada', `Campanha ${input.dyCampaignId} não encontrada no export do DY.`);
      if (c.labels.some((l) => l.startsWith('faro:')))
        throw new HttpError(409, 'campanha_ja_vinculada', 'Essa campanha já tem faroId nos labels.');
      const catalog = await ports.metrics.list();
      const exp = await db.transaction(async (tx) => {
        const linked = await findByCampaignId(tx, c.campaignId);
        if (linked) throw new HttpError(409, 'campanha_ja_vinculada', `Essa campanha já foi importada como ${linked.faroId}.`);
        const [control = 'controle', ...variants] = c.variations;
        const base = blankDraft({ ownerEmail: actor, ownerSquad: input.ownerSquad });
        const sum = c.observedSplit.reduce((a, b) => a + b, 0) || 1;
        const fields: DraftFields = {
          ...base,
          name: c.campaignName,
          bu: input.bu,
          design: {
            ...base.design,
            control: { name: control, description: control },
            variants: variants.map((v, i) => ({ key: String.fromCharCode(97 + i), name: v, description: v })),
          },
          audience: { description: 'Não registrado (importado do DY)', source: 'manual' },
          allocation: {
            platforms: c.platforms,
            pages: c.pages,
            // DECISAO-PENDENTE: o export não traz o % de tráfego; assume 100%.
            trafficPercent: 100,
            split: c.observedSplit.map((s) => Math.round((s / sum) * 10000) / 10000),
            startDate: c.firstSeen,
            endDate: '',
          },
          dy: { campaignName: c.campaignName, campaignId: c.campaignId, labels: c.labels, configuredBy: 'importacao-legado' },
          legacy: true,
        };
        // DECISAO-PENDENTE: legado entra como configurado_no_dy; a frente 2 promove a rodando.
        return insertNew(tx, catalog, fields, actor, 'configurado_no_dy');
      });
      return view(exp);
    },
  };
}
