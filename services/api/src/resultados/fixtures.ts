// E8 — ResultsResponse a partir das fixtures quando o experimento não está no snapshot: o Nexus
// completo (fixtures/nexus-results.json, frente 4) e, para os demais, os MetricResult e a saúde
// das fixtures da frente 2. Mesma forma da fonte roadmap, com `source: 'fixtures'`.
import nexusResults from '@faro/contracts/fixtures/nexus-results.json' with { type: 'json' };
import {
  resultsResponseSchema,
  type Experiment,
  type ExperimentHealth,
  type Grain,
  type MetricDefinition,
  type MetricResult,
  type Platform,
  type ResultsResponse,
  type SynthesisPart,
  type VariantSummary,
} from '@faro/contracts';
import { recommend, srm, synthesize } from '@faro/stats';
import { HttpError } from '../errors.ts';

/** Chave do controle nas fixtures da frente 2 e no painel. */
export const CONTROL_KEY = 'controle';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface FixtureInput {
  experiment: Experiment;
  metricResults: MetricResult[];
  health?: ExperimentHealth;
  metrics: MetricDefinition[];
  asOf: string;
}

/** Recorte de um ResultsResponse completo por plataforma e grão (sem recalcular nada). */
export function filterResponse(full: ResultsResponse, platform: Platform | 'all', grain: Grain): ResultsResponse {
  if (!full.platforms.includes(platform))
    return { ...full, results: [], volumes: [], health: [], funnel: undefined, notes: [...(full.notes ?? []), `Plataforma ${platform} não disponível para este experimento.`] };
  return {
    ...full,
    grain,
    results: full.results.filter((r) => r.platform === platform && r.grain === grain),
    volumes: full.volumes.filter((v) => v.platform === platform),
    health: full.health.filter((h) => h.platform === platform),
    ...(full.funnel ? { funnel: { steps: full.funnel.steps, rows: full.funnel.rows.filter((f) => f.platform === platform) } } : {}),
  };
}

let nexusCache: ResultsResponse | undefined;

export function fixtureResults(input: FixtureInput, opts: { grain?: Grain; platform?: Platform | 'all' } = {}): ResultsResponse {
  const platform = opts.platform ?? 'all';
  const grain = opts.grain ?? 'user';
  const exp = input.experiment;
  // Só o Nexus de verdade usa a fixture completa: um rascunho novo em banco vazio também recebe FARO-2026-0001.
  const isNexus = [exp.dy?.campaignName, exp.name].some((n) => n?.trim().toLowerCase() === 'nexus | nova home do app');
  if (exp.faroId === nexusResults.faroId && isNexus) {
    nexusCache ??= resultsResponseSchema.parse(nexusResults);
    return filterResponse(nexusCache, platform, grain);
  }

  const d = exp.design;
  const arms = [
    { key: CONTROL_KEY, name: d.control.name || 'Controle', isControl: true },
    ...d.variants.map((v) => ({ key: v.key, name: v.name || v.key, isControl: false })),
  ];
  if (arms.length < 2) throw new HttpError(409, 'sem_leitura', 'Experimento sem variantes definidas; não há leitura.');
  const split = exp.allocation.split.length === arms.length ? exp.allocation.split : arms.map(() => 1 / arms.length);
  const users = input.health?.usersByVariant;
  const total = users ? Object.values(users).reduce((a, b) => a + b, 0) : 0;
  const variants: VariantSummary[] = arms.map((a, i) => ({
    ...a,
    plannedShare: split[i]!,
    ...(users && total > 0 && users[a.key] != null ? { observedShare: users[a.key]! / total } : {}),
  }));

  const all = input.metricResults.filter((r) => r.faroId === exp.faroId);
  const platforms: (Platform | 'all')[] = ['all', ...([...new Set(all.map((r) => r.platform))].filter((p) => p !== 'all') as Platform[])];
  const results = all.filter((r) => r.platform === platform && r.grain === grain);
  const asOf = all[0]?.asOf ?? input.asOf;
  const notes = [
    'Fixture: números do protótipo (frente 2), sem volumes, série diária nem funil. Rode npm run job:sync-roadmap para a fonte real.',
    ...(!platforms.includes(platform) ? [`Plataforma ${platform} não disponível para este experimento.`] : []),
  ];

  const counts = users ? arms.map((a) => users[a.key] ?? 0) : [];
  const srmBase = counts.length === arms.length && counts.some((c) => c > 0) ? srm(counts, split) : undefined;
  const pValue = input.health?.srmPValue ?? srmBase?.pValue ?? 1;
  const srmResult = {
    chiSquare: srmBase?.chiSquare ?? 0,
    degreesOfFreedom: Math.max(1, arms.length - 1),
    pValue,
    alert: pValue < 0.001,
    plannedShares: split,
    observedShares: srmBase?.observedShares ?? arms.map(() => 0),
    ...(input.health?.unstableSplitDays != null ? { unstableSplitDays: input.health.unstableSplitDays } : {}),
  };
  const exposed = total;
  const contaminated = input.health?.contaminatedUsers ?? 0;
  const contamination = { users: contaminated, share: exposed + contaminated > 0 ? contaminated / (exposed + contaminated) : 0 };

  const byId = new Map(input.metrics.map((m) => [m.id, m]));
  const first = arms[1]!;
  const norte = results.find((r) => r.metricId === d.primaryMetricId && r.variantKey === first.key);
  const mde = [...new Set(results.filter((r) => r.mde != null).map((r) => r.metricId))].map((metricId) => ({
    metricId,
    mdeCurrent: Math.max(...results.filter((r) => r.metricId === metricId && r.mde != null).map((r) => r.mde!)),
    ...(metricId === d.primaryMetricId ? { mdeDesign: d.mdeRelative } : {}),
  }));
  const recommendation = recommend({
    status: exp.status,
    hasData: results.length > 0,
    srmPValue: pValue,
    variants: variants.map((v) => ({ key: v.key, name: v.name, isControl: v.isControl, ...(v.observedShare != null ? { observedShare: v.observedShare } : {}) })),
    primary: { name: byId.get(d.primaryMetricId)?.name ?? d.primaryMetricId, ...(norte?.probBetter != null ? { probBetter: norte.probBetter } : {}), ...(norte?.label ? { label: norte.label } : {}) },
    guardrails: d.guardrailMetricIds.map((id) => {
      const r = results.find((x) => x.metricId === id && x.variantKey === first.key);
      return { metricId: id, name: byId.get(id)?.name ?? id, ...(r?.probBetter != null ? { probBetter: r.probBetter } : {}) };
    }),
    ...(exp.decision ? { decisionText: exp.decision.rationale } : {}),
  });
  const parts: SynthesisPart[] = results
    .filter((x) => x.variantKey === first.key && x.deltaRelative != null && x.probBetter != null && x.label)
    .map((x) => ({
      metricId: x.metricId,
      name: byId.get(x.metricId)?.name ?? x.metricId,
      role: x.metricId === d.primaryMetricId ? 'norte' : d.guardrailMetricIds.includes(x.metricId) ? 'guarda' : d.secondaryMetricIds.includes(x.metricId) ? 'secundaria' : 'outra',
      deltaRelative: x.deltaRelative!,
      probBetter: x.probBetter!,
      label: x.label!,
    }));
  const iso = (v: string | undefined, fallback: string) => (v && ISO.test(v) ? v : fallback);

  const payload: ResultsResponse = {
    faroId: exp.faroId,
    asOf,
    readWindow: { start: iso(exp.allocation.readWindow?.start ?? exp.allocation.startDate, asOf), end: iso(exp.allocation.readWindow?.end ?? exp.allocation.endDate, asOf) },
    source: 'fixtures',
    grain,
    availableGrains: ['user'],
    platforms,
    variants,
    contamination,
    volumes: [],
    results,
    srm: srmResult,
    mde,
    health: [],
    recommendation,
    ...(parts.length ? { synthesis: synthesize({ variantKey: first.key, variantName: first.name, platform, metrics: parts }) } : {}),
    lineage: [{ metricId: '*', sourceTable: 'fixtures (packages/contracts/fixtures/metric-results.json, experiment-health.json)', sqlRef: 'docs/prototipo/faro-prototipo.html', sqlVersion: 'protótipo 13/10/2026' }],
    notes,
  };
  return resultsResponseSchema.parse(payload);
}
