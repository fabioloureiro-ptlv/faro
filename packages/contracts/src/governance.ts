// Acréscimos da frente 2 (painel centralizado), incorporados na unificação dos repositórios.
// Ver CHANGELOG 0.2.0-unificado e docs/adr/0002-unificacao-contratos.md.
import { z } from 'zod';
import type { SignificanceLabel } from './domain.ts';
import { DecisionSchema, ExperimentStatusSchema, FaroIdSchema, PlatformSchema } from './schemas.ts';

/** Só https: impede `javascript:` e afins quando a URL vira link na UI. */
export const HttpsUrlSchema = z.string().regex(/^https:\/\//, 'apenas URLs https');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'data ISO esperada');

/** Regra única de rótulo de significância (contexto, seção 6). probBetter já invertido para lower_better. */
export function labelFor(probBetter: number): SignificanceLabel {
  if (probBetter >= 0.95) return 'melhora_confirmada';
  if (probBetter >= 0.8) return 'tendencia_de_melhora';
  if (probBetter <= 0.05) return 'queda_confirmada';
  if (probBetter <= 0.2) return 'tendencia_de_queda';
  return 'sem_tendencia';
}

// ---- Governança (PNL-08) ----

export const GOVERNANCE_RULES = [
  'design_incompleto',
  'decidido_ativo',
  'split_extremo',
  'srm',
  'parada_antecipada',
  'passou_da_data',
  'sem_exposicao',
  'divergencia_config',
  'conflito_sem_resolucao',
  'campanha_orfa',
] as const;

export const GovernanceAlertSchema = z
  .object({
    id: z.string().min(1),
    faroId: FaroIdSchema.optional(),
    dyCampaignId: z.string().optional(),
    rule: z.enum(GOVERNANCE_RULES),
    severity: z.enum(['info', 'atencao', 'critico']),
    message: z.string().min(1),
    suggestedAction: z.string().min(1),
    owner: z.string().min(1),
    createdAt: isoDate,
    resolvedAt: isoDate.optional(),
  })
  .refine((a) => !!a.faroId || !!a.dyCampaignId, { message: 'alerta precisa de faroId ou dyCampaignId' });

export type GovernanceAlert = z.infer<typeof GovernanceAlertSchema>;
export type GovernanceRule = (typeof GOVERNANCE_RULES)[number];

// ---- Saúde do experimento (proposta da frente 2; dono: frente 4) ----

export const ExperimentHealthSchema = z.object({
  faroId: FaroIdSchema,
  /** Usuários expostos por braço (chave = variantKey; controle = "controle"). */
  usersByVariant: z.record(z.string().min(1), z.number().int().nonnegative()),
  /** Usuários que viram mais de uma variante; excluídos da leitura. */
  contaminatedUsers: z.number().int().nonnegative(),
  unstableSplitDays: z.number().int().nonnegative().optional(),
  /** p-valor do qui-quadrado sobre o split esperado (SRM). Alerta com p < 0,001. */
  srmPValue: z.number().min(0).max(1).optional(),
  /** Amostra planejada por braço para o MDE do design. */
  plannedSamplePerArm: z.number().int().positive().optional(),
  asOf: isoDate,
});

export type ExperimentHealth = z.infer<typeof ExperimentHealthSchema>;

// ---- Situação de campanha no export do DY (órfãs, PNL-07) ----
// Era "DyCampaignSnapshot" no repo da frente 2; renomeado na unificação para não
// colidir com o DyCampaignSnapshot (variações × refdate) do config-core.

export const DyCampaignStatusSchema = z.object({
  campaignId: z.string().min(1),
  campaignName: z.string().min(1),
  labels: z.array(z.string()),
  active: z.boolean(),
  lastExposureDate: isoDate.nullable(),
  asOf: isoDate,
});

export type DyCampaignStatus = z.infer<typeof DyCampaignStatusSchema>;

// ---- Linha do tempo do experimento (PNL-11) ----
// Forma de consumo do painel. Os produtores (frente 1: outbox; frente 2: comandos)
// mapeiam seus eventos para esta união.

export const TimelineStatusChangedSchema = z.object({
  type: z.literal('experiment.status_changed'),
  faroId: FaroIdSchema,
  from: ExperimentStatusSchema,
  to: ExperimentStatusSchema,
  actor: z.string().min(1),
  reason: z.string().optional(),
  at: isoDate,
});

export const TimelineDecidedSchema = z.object({
  type: z.literal('experiment.decided'),
  faroId: FaroIdSchema,
  decision: DecisionSchema,
  at: isoDate,
});

export const TimelineCreatedSchema = z.object({
  type: z.literal('experiment.created'),
  faroId: FaroIdSchema,
  actor: z.string().min(1),
  importedFromDy: z.boolean().optional(),
  at: isoDate,
});

export const TimelineDesignChangedSchema = z.object({
  type: z.literal('experiment.design_changed'),
  faroId: FaroIdSchema,
  actor: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1),
  at: isoDate,
});

export const TimelineAllocationChangedSchema = z.object({
  type: z.literal('experiment.allocation_changed'),
  faroId: FaroIdSchema,
  actor: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1),
  at: isoDate,
});

export const ExperimentAuditEventSchema = z.discriminatedUnion('type', [
  TimelineCreatedSchema,
  TimelineStatusChangedSchema,
  TimelineDecidedSchema,
  TimelineDesignChangedSchema,
  TimelineAllocationChangedSchema,
]);

export type ExperimentAuditEvent = z.infer<typeof ExperimentAuditEventSchema>;
export type ExperimentStatusChangedEvent = z.infer<typeof TimelineStatusChangedSchema>;
export type ExperimentDecidedEvent = z.infer<typeof TimelineDecidedSchema>;

// ---- Catálogo de páginas na forma consumida pelo painel (PNL-06/12) ----
// Convive com PageCatalog (catalogs.ts): o painel lê PageDefinition[]; a API
// deriva de PageCatalog até as frentes 1 e 3 unificarem a fonte real de tráfego.

export const PageDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dailyUsers: z.number().int().nonnegative(),
  /** Usuários/dia por plataforma (visão de capacidade, PNL-12). */
  dailyUsersByPlatform: z.partialRecord(PlatformSchema, z.number().int().nonnegative()).optional(),
});

export type PageDefinition = z.infer<typeof PageDefinitionSchema>;
