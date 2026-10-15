// Frente 4 — leitura das linhas de resultado da consulta do roadmap (dy_results v3) para o
// painel: MetricResult da NORTE por experimento vinculável. A fonte (snapshot do job:sync-roadmap
// ou saída do job:sync-results) é escolhida em roadmap/source.ts; o payload completo de
// GET /results/:faroId é montado em roadmap/adapter.ts.
import { labelFor, ROADMAP_METRICS, ROADMAP_METRIC_TO_FARO, type Experiment, type MetricResult } from '@faro/contracts';
import { getResultsSource } from './roadmap/source.ts';
import type { ResultsRow, RoadmapSnapshot } from './roadmap/types.ts';

export { RESULTS_PATH } from './roadmap/paths.ts';
/** Linha do dy_results.sql como o adapter a lê (zod, passthrough). */
export type ResultRow = ResultsRow;

/** Após o sync (job ou POST /painel/dy-refresh), a próxima leitura vem do disco. */
export function invalidateResultsCache(): void {
  getResultsSource().invalidate();
}

/** Id do catálogo correspondente à coluna de métrica do dy_results (ex.: norte). */
export function metricIdFromColumn(col: string): string {
  return ROADMAP_METRIC_TO_FARO[col] ?? 'receita_por_usuario';
}

export function hasRealResults(): boolean {
  return !!getResultsSource().snapshot();
}

export function loadRows(): ResultsRow[] {
  return getResultsSource().snapshot()?.results ?? [];
}

/** Plataforma do contrato a partir do stream + device da linha. */
function platformsOf(row: ResultsRow): MetricResult['platform'][] {
  if (row.device === 'Total') return row.stream === 'web' ? ['all', 'site'] : ['all'];
  if (row.device === 'iOS') return ['ios'];
  if (row.device === 'Android') return ['android'];
  return []; // Mobile/Desktop do web não têm slot no contrato (DECISAO-PENDENTE: granularidade)
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Converte as linhas de um teste em MetricResult[] para um faroId (painel: chave do controle = "controle"). */
export function rowsToMetricResults(faroId: string, rows: ResultsRow[], asOf: string): MetricResult[] {
  const out: MetricResult[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const grain = row.grao === 'sessao' ? 'session' : 'user';
    const variantKey = row.is_controle ? 'controle' : row.variacao;
    const rowAsOf = typeof row.dados_ate === 'string' ? row.dados_ate : asOf;
    for (const platform of platformsOf(row)) {
      for (const colName of ROADMAP_METRICS) {
        const metricId = ROADMAP_METRIC_TO_FARO[colName]!;
        const value = num(r[colName]);
        if (value === undefined) continue;
        const probBetter = row.is_controle ? undefined : num(r[`p_vence_${colName}`]);
        const mde = num(r[`mde_${colName}`]);
        out.push({
          faroId,
          metricId,
          platform,
          grain,
          variantKey,
          value,
          n: Math.round(num(row.unidades) ?? 0),
          ...(row.is_controle ? {} : { deltaRelative: num(r[`uplift_${colName}`]) }),
          ...(probBetter !== undefined ? { probBetter: Math.min(1, Math.max(0, probBetter)), label: labelFor(probBetter) } : {}),
          ...(mde !== undefined ? { mde } : {}),
          asOf: rowAsOf,
        });
      }
    }
  }
  return out;
}

/** Vincula linhas a um experimento pelo nome da campanha no DY (ou da importação de legado). */
export function rowsForExperiment(exp: Experiment, rows = loadRows()): ResultsRow[] {
  const names = new Set([exp.dy?.campaignName, exp.name].filter((n): n is string => !!n).map((n) => n.trim().toLowerCase()));
  return rows.filter((r) => names.has(r.campanha.trim().toLowerCase()));
}

/** MetricResult reais de todos os experimentos vinculáveis (para o painel). */
export function realMetricResults(experiments: Experiment[], snap: RoadmapSnapshot | undefined = getResultsSource().snapshot()): MetricResult[] {
  if (!snap) return [];
  return experiments.flatMap((e) => rowsToMetricResults(e.faroId, rowsForExperiment(e, snap.results), snap.meta.dadosAte));
}
