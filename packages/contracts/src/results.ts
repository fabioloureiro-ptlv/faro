// Contratos produzidos pela frente 4 (API de resultados, MET-14), incorporados
// na unificação a partir do repo faro-hackathon. Formas idênticas às originais;
// só os imports foram adaptados ao pacote unificado.
import { z } from 'zod';
import type { Grain, MetricResult, Platform, SignificanceLabel } from './domain.ts';
import { MetricResultSchema, PlatformSchema, SignificanceLabelSchema } from './schemas.ts';

export interface VariantSummary {
  key: string;
  name: string;
  isControl: boolean;
  plannedShare: number; // 0–1
  observedShare?: number; // 0–1, consolidado
}

export interface VolumesRow {
  platform: Platform | 'all';
  variantKey: string;
  users: number;
  buyers: number;
  transactions: number;
  revenue: number;
}

export interface SrmResult {
  chiSquare: number;
  degreesOfFreedom: number;
  pValue: number;
  alert: boolean; // p < 0,001
  plannedShares: number[];
  observedShares: number[];
  unstableSplitDays?: number;
}

export interface Contamination {
  users: number;
  share: number; // 0–1 sobre os expostos
}

export interface SampleProgress {
  requiredPerArm: number;
  minPerArm: number;
  progress: number; // 0–1, limitado a 1
  earlySignificanceAlert: boolean;
}

export interface MdeRow {
  metricId: string;
  mdeCurrent: number | null; // relativo, 0–1
  mdeDesign?: number; // relativo, 0–1 (só para a NORTE)
}

export interface TestHealthPoint {
  date: string; // YYYY-MM-DD
  platform: Platform | 'all';
  variantKey: string;
  exposedUsers: number;
  primaryValue?: number | null;
}

export type RecommendationCode =
  | 'aguardando_dados'
  | 'encerrado'
  | 'investigar_srm'
  | 'desligar_campanha'
  | 'avaliar_guardrail'
  | 'implementar'
  | 'manter_ate_amostra'
  | 'desligar_variante'
  | 'encerrar_sem_vencedor'
  | 'manter_rodando';

export interface Recommendation {
  code: RecommendationCode;
  title: string;
  body: string;
  severity: 'ok' | 'warn' | 'risk' | 'info';
}

export interface SynthesisPart {
  metricId: string;
  name: string;
  role: 'norte' | 'guarda' | 'secundaria' | 'outra';
  deltaRelative: number;
  probBetter: number;
  label: SignificanceLabel;
}

export interface Synthesis {
  variantKey: string;
  variantName: string;
  platform: Platform | 'all';
  text: string;
  parts: SynthesisPart[];
}

export interface Lineage {
  metricId: string;
  sourceTable: string;
  sqlRef: string;
  sqlVersion: string;
}

/** Funil de jornada por variante (MET-15). Passos ordenados; `users` é o número de unidades do grão que chegaram ao passo. */
export interface FunnelStep {
  stepId: string;
  name: string;
  order: number; // 0 = topo (expostos)
  metricId?: string; // métrica do catálogo que define o passo, quando houver
}

export interface FunnelRow {
  platform: Platform | 'all';
  variantKey: string;
  stepId: string;
  users: number;
}

export interface Funnel {
  steps: FunnelStep[];
  rows: FunnelRow[];
}

/** 0.4.0 (E8): de onde veio a janela de leitura (`origem_datas` do roadmap). */
export type ReadWindowOrigin = 'roadmap' | 'detectado' | 'periodo_inteiro';
/** 0.4.0 (E8): quem montou a resposta. */
export type ResultsSource = 'roadmap' | 'fixtures';

export interface ResultsResponse {
  faroId: string;
  asOf: string; // data dos dados (D-1)
  fetchedAt?: string;
  readWindow: { start: string; end: string; origin?: ReadWindowOrigin };
  /** 0.4.0 (E8): fonte dos números. Obrigatório, para a tela dizer de onde veio. */
  source: ResultsSource;
  /** 0.4.0 (E8): `status` da linha na consulta do roadmap (saudavel, decidido, volume baixo, split desigual). */
  status?: string;
  /** 0.4.0 (E8): guardrails que pioraram segundo o SQL (`guardas_piora`), como metricId. */
  guardrailsWorse?: string[];
  grain: Grain;
  availableGrains: Grain[];
  platforms: (Platform | 'all')[];
  variants: VariantSummary[];
  contamination: Contamination;
  volumes: VolumesRow[];
  results: MetricResult[];
  srm: SrmResult;
  sample?: SampleProgress;
  mde: MdeRow[];
  health: TestHealthPoint[];
  funnel?: Funnel;
  recommendation: Recommendation;
  synthesis?: Synthesis;
  lineage: Lineage[];
  notes?: string[];
}

// ---- Schemas (frente 4) ----

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const platformOrAllSchema = z.union([PlatformSchema, z.literal('all')]);
export const grainSchema = z.enum(['user', 'session']);
export const ReadWindowOriginSchema = z.enum(['roadmap', 'detectado', 'periodo_inteiro']);
export const ResultsSourceSchema = z.enum(['roadmap', 'fixtures']);

export const recommendationSchema = z.object({
  code: z.enum([
    'aguardando_dados',
    'encerrado',
    'investigar_srm',
    'desligar_campanha',
    'avaliar_guardrail',
    'implementar',
    'manter_ate_amostra',
    'desligar_variante',
    'encerrar_sem_vencedor',
    'manter_rodando',
  ]),
  title: z.string(),
  body: z.string(),
  severity: z.enum(['ok', 'warn', 'risk', 'info']),
});

export const resultsResponseSchema: z.ZodType<ResultsResponse> = z.object({
  faroId: z.string(),
  asOf: isoDate,
  fetchedAt: z.string().optional(),
  readWindow: z.object({ start: isoDate, end: isoDate, origin: ReadWindowOriginSchema.optional() }),
  source: ResultsSourceSchema,
  status: z.string().optional(),
  guardrailsWorse: z.array(z.string()).optional(),
  grain: grainSchema,
  availableGrains: z.array(grainSchema).min(1),
  platforms: z.array(platformOrAllSchema).min(1),
  variants: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        isControl: z.boolean(),
        plannedShare: z.number().min(0).max(1),
        observedShare: z.number().min(0).max(1).optional(),
      }),
    )
    .min(2),
  contamination: z.object({ users: z.number().int().nonnegative(), share: z.number().min(0).max(1) }),
  volumes: z.array(
    z.object({
      platform: platformOrAllSchema,
      variantKey: z.string(),
      users: z.number().nonnegative(),
      buyers: z.number().nonnegative(),
      transactions: z.number().nonnegative(),
      revenue: z.number().nonnegative(),
    }),
  ),
  results: z.array(MetricResultSchema),
  srm: z.object({
    chiSquare: z.number().nonnegative(),
    degreesOfFreedom: z.number().int().positive(),
    pValue: z.number().min(0).max(1),
    alert: z.boolean(),
    plannedShares: z.array(z.number()),
    observedShares: z.array(z.number()),
    unstableSplitDays: z.number().int().nonnegative().optional(),
  }),
  sample: z
    .object({
      requiredPerArm: z.number().nonnegative(),
      minPerArm: z.number().nonnegative(),
      progress: z.number().min(0).max(1),
      earlySignificanceAlert: z.boolean(),
    })
    .optional(),
  mde: z.array(z.object({ metricId: z.string(), mdeCurrent: z.number().nullable(), mdeDesign: z.number().optional() })),
  health: z.array(
    z.object({
      date: isoDate,
      platform: platformOrAllSchema,
      variantKey: z.string(),
      exposedUsers: z.number().nonnegative(),
      primaryValue: z.number().nullable().optional(),
    }),
  ),
  funnel: z
    .object({
      steps: z
        .array(z.object({ stepId: z.string(), name: z.string(), order: z.number().int().nonnegative(), metricId: z.string().optional() }))
        .min(2),
      rows: z.array(z.object({ platform: platformOrAllSchema, variantKey: z.string(), stepId: z.string(), users: z.number().nonnegative() })),
    })
    .optional(),
  recommendation: recommendationSchema,
  synthesis: z
    .object({
      variantKey: z.string(),
      variantName: z.string(),
      platform: platformOrAllSchema,
      text: z.string(),
      parts: z.array(
        z.object({
          metricId: z.string(),
          name: z.string(),
          role: z.enum(['norte', 'guarda', 'secundaria', 'outra']),
          deltaRelative: z.number(),
          probBetter: z.number(),
          label: SignificanceLabelSchema,
        }),
      ),
    })
    .optional(),
  lineage: z.array(z.object({ metricId: z.string(), sourceTable: z.string(), sqlRef: z.string(), sqlVersion: z.string() })),
  notes: z.array(z.string()).optional(),
});
