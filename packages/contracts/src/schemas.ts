// Schemas de validação dos tipos de domain.ts. Validam forma, não regras de negócio
// (o gate de design e as regras de prontidão ficam em @faro/config-core).
import { z } from 'zod';

export const FARO_ID_PATTERN = /^FARO-\d{4}-\d{4}$/;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');
// Unificação: a frente 1 grava datetime completo; a frente 2 e suas fixtures usam só a data.
const isoDateTime = z.union([z.iso.datetime({ offset: true }), isoDate]);

export const BuSchema = z.enum(['ecom', 'saude', 'fintech', 'servicos', 'ecossistema']);
export const PlatformSchema = z.enum(['site', 'android', 'ios']);
export const EXPERIMENT_STATUSES = [
  'rascunho',
  'design_completo',
  'pronto_para_configurar',
  'configurado_no_dy',
  'rodando',
  'decidido',
  'encerrado',
  'cancelado',
] as const;
export const ExperimentStatusSchema = z.enum(EXPERIMENT_STATUSES);

export const FaroIdSchema = z.string().regex(FARO_ID_PATTERN, 'faroId fora do formato FARO-AAAA-NNNN');

export const DesignSchema = z.object({
  context: z.string(),
  hypothesis: z.object({ change: z.string(), expectedEffect: z.string(), because: z.string() }),
  control: z.object({ name: z.string(), description: z.string(), figmaUrl: z.string().optional() }),
  variants: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string(),
      description: z.string(),
      figmaUrl: z.string().optional(),
      /** Print da variante: URL https ou imagem embutida (data:image/...). */
      printUrl: z
        .string()
        .regex(/^(https:\/\/|data:image\/)/, 'print precisa ser uma URL https ou uma imagem')
        .optional(),
    }),
  ),
  primaryMetricId: z.string(),
  secondaryMetricIds: z.array(z.string()),
  guardrailMetricIds: z.array(z.string()),
  mdeRelative: z.number().min(0),
  baselineOverride: z.number().positive().optional(),
});

// Frente 3 (03-segmentacao-e-sobreposicao.md § 8): regra estruturada de público.
export const AudienceConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('comprou'),
    dimension: z.enum(['categoria', 'marca', 'item']),
    values: z.array(z.string().min(1)).min(1),
    windowDays: z.number().int().positive().max(730),
  }),
  z.object({
    type: z.literal('evento'),
    eventName: z.string().min(1),
    windowDays: z.number().int().positive().max(730),
    minCount: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('propriedade'),
    key: z.string().min(1),
    op: z.enum(['eq', 'in', 'neq']),
    values: z.array(z.string().min(1)).min(1),
  }),
  z.object({ type: z.literal('plataforma'), values: z.array(PlatformSchema).min(1) }),
]);

export interface AudienceRuleShape {
  op: 'and' | 'or';
  conditions: (z.infer<typeof AudienceConditionSchema> | AudienceRuleShape)[];
}

export const AudienceRuleSchema: z.ZodType<AudienceRuleShape> = z.lazy(() =>
  z.object({
    op: z.enum(['and', 'or']),
    conditions: z.array(z.union([AudienceConditionSchema, AudienceRuleSchema])).min(1),
  }),
);

export const ExclusionGroupSchema = z
  .object({
    id: z.string().min(1),
    pages: z.array(z.string().min(1)).min(1),
    platforms: z.array(PlatformSchema).min(1),
    slices: z.array(z.object({ faroId: FaroIdSchema, percent: z.number().min(0).max(100) })).min(1),
  })
  .refine((g) => g.slices.reduce((s, x) => s + x.percent, 0) <= 100, {
    message: 'a soma das fatias não pode passar de 100%',
    path: ['slices'],
  });

export const ObservedOverlapSchema = z.object({
  faroIdA: FaroIdSchema,
  faroIdB: FaroIdSchema,
  usersBoth: z.number().int().nonnegative(),
  shareOfA: z.number().min(0).max(1),
  shareOfB: z.number().min(0).max(1),
  asOf: isoDate,
});

export const AudienceSchema = z.object({
  description: z.string(),
  source: z.enum(['atalho', 'regra', 'manual']),
  rule: AudienceRuleSchema.optional(),
  estimatedShare: z.number().min(0).max(1).optional(),
  dyAttribute: z.string().optional(),
  params: z.record(z.string(), z.number()).optional(),
});

export const PageTargetSchema = z.object({
  pageId: z.string().min(1),
  urlPattern: z.string().trim().max(300).optional(),
  appPath: z.string().trim().max(200).optional(),
});

export const AllocationSchema = z.object({
  platforms: z.array(PlatformSchema),
  pages: z.array(z.string()),
  pageTargets: z.array(PageTargetSchema).optional(),
  trafficPercent: z.number().min(0).max(100),
  split: z.array(z.number().min(0).max(1)),
  startDate: z.union([isoDate, z.literal('')]),
  endDate: z.union([isoDate, z.literal('')]),
  exclusionGroupId: z.string().optional(),
});

export const DyCampaignTypeSchema = z.enum(['custom_code', 'api_custom', 'recommendation']);

export const DyLinkSchema = z.object({
  campaignName: z.string(),
  campaignId: z.string().optional(),
  campaignType: DyCampaignTypeSchema.optional(),
  selector: z.string().optional(),
  labels: z.array(z.string()),
  configuredAt: isoDateTime.optional(),
  configuredBy: z.string().optional(),
});

export const OverlapDecisionSchema = z.object({
  otherFaroId: FaroIdSchema,
  severity: z.enum(['baixo', 'medio', 'alto']),
  estimatedDailyUsers: z.number().min(0),
  resolution: z.enum(['exclusao_mutua', 'paralelo', 'reagendar']).optional(),
  decidedBy: z.string().optional(),
  decidedAt: isoDateTime.optional(),
});

export const DecisionSchema = z.object({
  outcome: z.enum(['implementar_variante', 'manter_controle', 'sem_vencedor', 'invalido']),
  rationale: z.string().min(1),
  decidedBy: z.string().min(1),
  decidedAt: isoDateTime,
  /** Unificação (frente 2, PNL-10): onde o aprendizado foi publicado; só https. */
  learningUrl: z.string().regex(/^https:\/\//, 'apenas URLs https').optional(),
});

export const ExperimentSchema = z.object({
  faroId: FaroIdSchema,
  name: z.string(),
  bu: BuSchema,
  ownerSquad: z.string(),
  ownerEmail: z.string(),
  status: ExperimentStatusSchema,
  templateId: z.string().optional(),
  design: DesignSchema,
  audience: AudienceSchema,
  allocation: AllocationSchema,
  overlap: z.array(OverlapDecisionSchema).optional(),
  dy: DyLinkSchema.optional(),
  decision: DecisionSchema.optional(),
  legacy: z.boolean().optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const MetricDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'id em snake_case'),
  name: z.string().min(1),
  section: z.enum(['Engajamento', 'eCom', 'Clube', 'Saúde', 'Fintech', 'Serviços', 'Atendimento', 'Operação', 'Retenção']),
  kind: z.enum(['proportion', 'mean', 'ratio']),
  direction: z.enum(['higher_better', 'lower_better']),
  unit: z.enum(['percent', 'brl', 'count', 'seconds', 'score']),
  grains: z.array(z.enum(['user', 'session'])).min(1),
  definition: z.string(),
  sqlTemplateRef: z.string(),
  baseline: z.number().optional(),
  cv: z.number().positive().optional(),
  owner: z.string(),
  status: z.enum(['ativa', 'rascunho', 'depreciada']),
  maturationDays: z.number().int().nonnegative().optional(),
});

export const SignificanceLabelSchema = z.enum([
  'melhora_confirmada',
  'tendencia_de_melhora',
  'sem_tendencia',
  'tendencia_de_queda',
  'queda_confirmada',
]);

export const MetricResultSchema = z.object({
  faroId: FaroIdSchema,
  metricId: z.string(),
  platform: z.union([PlatformSchema, z.literal('all')]),
  grain: z.enum(['user', 'session']),
  variantKey: z.string(),
  value: z.number().nullable(),
  n: z.number().int().min(0),
  deltaRelative: z.number().optional(),
  probBetter: z.number().min(0).max(1).optional(),
  label: SignificanceLabelSchema.optional(),
  mde: z.number().optional(),
  asOf: isoDate,
  ci95: z.object({ lower: z.number(), upper: z.number() }).optional(),
  maturing: z.boolean().optional(),
});

export const ConfigDivergenceSchema = z.object({
  faroId: FaroIdSchema,
  campaignId: z.string(),
  refdate: isoDate,
  kind: z.enum([
    'variacao_ausente',
    'variacao_extra',
    'nome_variacao',
    'split',
    'plataforma_ausente',
    'plataforma_extra',
  ]),
  expected: z.string(),
  observed: z.string(),
  message: z.string(),
});
