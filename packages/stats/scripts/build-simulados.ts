/**
 * Gera os cinco testes simulados do contexto (seção 10) como fixtures ResultsResponse,
 * passando pelo motor estatístico. Uso: npm run fixtures:simulados
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExperimentStatus, MetricResult, ResultsResponse, SynthesisPart } from '@faro/contracts';
import { resultsResponseSchema } from '@faro/contracts';
import {
  evaluateMetric, generateArmValues, mdeMean, mdeProportion, recommend, sampleProgress, sampleSizeProportion,
  srm, summarizeMean, summarizeProportion, synthesize, type Comparison
} from '../src/index.ts';

interface MetricSpec { id: string; name: string; role: 'norte' | 'guarda' | 'secundaria'; kind: 'proportion' | 'mean'; direction: 'higher_better' | 'lower_better'; base: number; cv?: number; lift: number }
interface Scenario {
  file: string; faroId: string; status: ExperimentStatus; variantName: string; nControl: number; nVariant: number;
  plannedShares: [number, number]; metrics: MetricSpec[]; requiredPerArm?: number; decisionText?: string; days: number; noData?: boolean;
  /** Passos intermediários do funil entre "expostos" e a conversão da NORTE, como múltiplos da taxa base da NORTE. */
  funnel?: { name: string; multiple: number }[];
}
const ECOM_FUNNEL = [{ name: 'Viu produto', multiple: 7.5 }, { name: 'Adicionou ao carrinho', multiple: 3.4 }, { name: 'Iniciou checkout', multiple: 1.8 }];
const SAUDE_FUNNEL = [{ name: 'Iniciou cadastro', multiple: 6 }, { name: 'Cadastrou o pet', multiple: 2.6 }];

const asOf = '2026-10-13';
const scenarios: Scenario[] = [
  { file: 'melhora_confirmada_amostra_incompleta', faroId: 'FARO-2026-0101', status: 'rodando', variantName: 'Cupom aplicado automaticamente', nControl: 18300, nVariant: 18232, plannedShares: [0.5, 0.5], days: 12,
    metrics: [{ id: 'conversao', name: 'Conversão', role: 'norte', kind: 'proportion', direction: 'higher_better', base: 0.0397, lift: 0.14 }, { id: 'ticket_medio', name: 'Ticket médio', role: 'secundaria', kind: 'mean', direction: 'higher_better', base: 232, cv: 0.8, lift: -0.02 }, { id: 'taxa_devolucao', name: 'Taxa de devolução', role: 'guarda', kind: 'proportion', direction: 'lower_better', base: 0.018, lift: 0.01 }] },
  { file: 'tendencia_sem_significancia', faroId: 'FARO-2026-0102', status: 'rodando', variantName: 'Barra de frete grátis no carrinho', nControl: 25100, nVariant: 24950, plannedShares: [0.5, 0.5], days: 9,
    metrics: [{ id: 'conversao', name: 'Conversão', role: 'norte', kind: 'proportion', direction: 'higher_better', base: 0.032, lift: 0.035 }, { id: 'receita_por_usuario', name: 'Receita por usuário', role: 'secundaria', kind: 'mean', direction: 'higher_better', base: 24.5, cv: 6, lift: 0.03 }] },
  { file: 'srm', faroId: 'FARO-2026-0103', status: 'rodando', variantName: 'Onboarding em 3 passos', nControl: 30520, nVariant: 28790, plannedShares: [0.5, 0.5], days: 13,
    metrics: [{ id: 'conversao_saude', name: 'Conversão em saúde', role: 'norte', kind: 'proportion', direction: 'higher_better', base: 0.015, lift: 0.14 }, { id: 'chamados_por_usuario', name: 'Chamados no SAC', role: 'guarda', kind: 'proportion', direction: 'lower_better', base: 0.006, lift: -0.02 }] },
  { file: 'encerrado_com_vencedor', faroId: 'FARO-2026-0104', status: 'encerrado', variantName: 'Cupom aplicado automaticamente', nControl: 30500, nVariant: 30380, plannedShares: [0.5, 0.5], days: 28, decisionText: 'Vencedor: Variante A. Implementado em 06/10.',
    metrics: [{ id: 'conversao', name: 'Conversão', role: 'norte', kind: 'proportion', direction: 'higher_better', base: 0.0397, lift: 0.113 }, { id: 'ticket_medio', name: 'Ticket médio', role: 'secundaria', kind: 'mean', direction: 'higher_better', base: 232, cv: 0.8, lift: -0.034 }] },
  { file: 'agendado_sem_dados', faroId: 'FARO-2026-0105', status: 'configurado_no_dy', variantName: 'Carrossel por raça e porte', nControl: 0, nVariant: 0, plannedShares: [0.5, 0.5], days: 0, noData: true,
    metrics: [{ id: 'cliques_recomendacao', name: 'Cliques na recomendação', role: 'norte', kind: 'proportion', direction: 'higher_better', base: 0.06, lift: 0 }] }
];

function build(s: Scenario): ResultsResponse {
  const C = 'controle', V = 'variante_a';
  const results: MetricResult[] = [];
  const parts: SynthesisPart[] = [];
  const mde: ResultsResponse['mde'] = [];
  let primary: Comparison | undefined;
  const guardrails: { metricId: string; name: string; probBetter?: number }[] = [];
  let seed = 1000;
  for (const m of s.metrics) {
    if (s.noData) { mde.push({ metricId: m.id, mdeCurrent: null }); continue; }
    const specC = m.kind === 'proportion' ? { kind: 'proportion' as const, n: s.nControl, p: m.base } : { kind: 'mean' as const, n: s.nControl, mean: m.base, cv: m.cv!, zeroShare: m.id === 'ticket_medio' ? 0 : 0.9 };
    const specV = m.kind === 'proportion' ? { kind: 'proportion' as const, n: s.nVariant, p: m.base * (1 + m.lift) } : { kind: 'mean' as const, n: s.nVariant, mean: m.base * (1 + m.lift), cv: m.cv!, zeroShare: m.id === 'ticket_medio' ? 0 : 0.9 };
    const vc = generateArmValues(specC, seed++), vv = generateArmValues(specV, seed++);
    const control = m.kind === 'proportion' ? summarizeProportion(vc) : summarizeMean(vc);
    const variant = m.kind === 'proportion' ? summarizeProportion(vv) : summarizeMean(vv);
    const cmp = evaluateMetric({ kind: m.kind, direction: m.direction, control, variant });
    const nMin = Math.min(s.nControl, s.nVariant);
    const mdeCurrent = m.kind === 'proportion' ? mdeProportion(cmp.controlValue, nMin) : mdeMean(Math.sqrt((control as { variance: number }).variance) / cmp.controlValue, nMin);
    results.push({ faroId: s.faroId, metricId: m.id, platform: 'all', grain: 'user', variantKey: C, value: cmp.controlValue, n: s.nControl, asOf });
    results.push({ faroId: s.faroId, metricId: m.id, platform: 'all', grain: 'user', variantKey: V, value: cmp.variantValue, n: s.nVariant, deltaRelative: cmp.deltaRelative, probBetter: cmp.probBetter, label: cmp.label, ci95: cmp.ci95, asOf, ...(mdeCurrent != null ? { mde: mdeCurrent } : {}) });
    mde.push({ metricId: m.id, mdeCurrent, ...(m.role === 'norte' ? { mdeDesign: 0.05 } : {}) });
    parts.push({ metricId: m.id, name: m.name, role: m.role, deltaRelative: cmp.deltaRelative, probBetter: cmp.probBetter, label: cmp.label });
    if (m.role === 'norte') primary = cmp;
    if (m.role === 'guarda') guardrails.push({ metricId: m.id, name: m.name, probBetter: cmp.probBetter });
  }
  const norte = s.metrics.find((m) => m.role === 'norte')!;
  const requiredPerArm = s.requiredPerArm ?? sampleSizeProportion(norte.base, 0.05);
  const sample = sampleProgress({ requiredPerArm, nPerArm: [s.nControl, s.nVariant], primaryProbBetter: primary?.probBetter });
  const srmResult = s.noData ? { chiSquare: 0, degreesOfFreedom: 1, pValue: 1, alert: false, plannedShares: [...s.plannedShares], observedShares: [0, 0] } : srm([s.nControl, s.nVariant], s.plannedShares);
  const variants = [
    { key: C, name: 'Controle', isControl: true, plannedShare: s.plannedShares[0], ...(s.noData ? {} : { observedShare: srmResult.observedShares[0] }) },
    { key: V, name: s.variantName, isControl: false, plannedShare: s.plannedShares[1], ...(s.noData ? {} : { observedShare: srmResult.observedShares[1] }) }
  ];
  const recommendation = recommend({
    status: s.status, hasData: !s.noData, srmPValue: srmResult.pValue, variants,
    primary: { name: norte.name.toLowerCase(), probBetter: primary?.probBetter, label: primary?.label }, guardrails,
    sampleProgress: sample.progress, minPerArm: sample.minPerArm, requiredPerArm, decisionText: s.decisionText
  });
  const health: ResultsResponse['health'] = [];
  for (let d = 0; d < s.days; d++) {
    const date = new Date(Date.UTC(2026, 9, 13 - (s.days - 1 - d))).toISOString().slice(0, 10);
    health.push({ date, platform: 'all', variantKey: C, exposedUsers: Math.round(s.nControl / s.days) });
    health.push({ date, platform: 'all', variantKey: V, exposedUsers: Math.round(s.nVariant / s.days) });
  }
  const buyersC = Math.round(s.nControl * norte.base), buyersV = Math.round(s.nVariant * norte.base * (1 + norte.lift));
  // funil: expostos → passos intermediários → conversão da NORTE; o lift da variante cresce ao longo do funil
  const mids = s.funnel ?? (norte.id === 'conversao_saude' ? SAUDE_FUNNEL : ECOM_FUNNEL);
  const steps = [{ stepId: 'expostos', name: 'Expostos', order: 0 }, ...mids.map((m, i) => ({ stepId: 'passo_' + (i + 1), name: m.name, order: i + 1 })), { stepId: 'conversao', name: norte.name, order: mids.length + 1, metricId: norte.id }];
  const funnelRows: NonNullable<ResultsResponse['funnel']>['rows'] = [];
  steps.forEach((st, i) => {
    const frac = i / (steps.length - 1);
    const rateC = i === 0 ? 1 : i === steps.length - 1 ? norte.base : Math.min(1, norte.base * mids[i - 1].multiple);
    const rateV = i === 0 ? 1 : rateC * (1 + norte.lift * frac);
    funnelRows.push({ platform: 'all', variantKey: C, stepId: st.stepId, users: i === steps.length - 1 ? buyersC : Math.round(s.nControl * rateC) });
    funnelRows.push({ platform: 'all', variantKey: V, stepId: st.stepId, users: i === steps.length - 1 ? buyersV : Math.round(s.nVariant * rateV) });
  });
  return resultsResponseSchema.parse({
    faroId: s.faroId, asOf, readWindow: { start: health[0]?.date ?? asOf, end: asOf }, grain: 'user', availableGrains: ['user', 'session'], platforms: ['all'],
    variants, contamination: { users: s.noData ? 0 : Math.round((s.nControl + s.nVariant) * 0.012), share: s.noData ? 0 : 0.012 },
    volumes: s.noData ? [] : [
      { platform: 'all', variantKey: C, users: s.nControl, buyers: buyersC, transactions: Math.round(buyersC * 1.25), revenue: Math.round(buyersC * 1.25 * 232) },
      { platform: 'all', variantKey: V, users: s.nVariant, buyers: buyersV, transactions: Math.round(buyersV * 1.25), revenue: Math.round(buyersV * 1.25 * 228) }
    ],
    results, srm: srmResult, sample, mde, health, ...(s.noData ? {} : { funnel: { steps, rows: funnelRows } }), recommendation,
    ...(s.noData ? {} : { synthesis: synthesize({ variantKey: V, variantName: 'Variante A', platform: 'all', metrics: parts }) }),
    lineage: [{ metricId: '*', sourceTable: 'sintético (packages/stats/generator)', sqlRef: 'scripts/build-simulados.ts', sqlVersion: '0.1.0' }],
    notes: ['Dados sintéticos seedados, gerados pelo motor estatístico do Faro para os casos de borda da seção 10 do contexto.']
  });
}

// Executado a partir da raiz do repositório (npm run fixtures:simulados); FARO_FIXTURES_DIR sobrescreve.
const outDir = (process.env.FARO_FIXTURES_DIR ?? resolve(process.cwd(), 'packages/contracts/fixtures/simulados')) + '/';
mkdirSync(outDir, { recursive: true });
for (const s of scenarios) {
  const r = build(s);
  writeFileSync(outDir + s.file + '.json', JSON.stringify(r, null, 2) + '\n');
  console.log(`${s.file}: ${r.recommendation.code}${r.synthesis ? ' · ' + r.synthesis.text : ''}`);
}
