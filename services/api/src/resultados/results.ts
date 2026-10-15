// Frente 4 — leitura dos resultados reais (saída do dy_results.sql materializada
// por npm run job:sync-results) e mapeamento para o contrato MetricResult.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { labelFor, type Experiment, type MetricResult } from '@faro/contracts';

export const RESULTS_PATH = fileURLToPath(new URL('../../.data/results.json', import.meta.url));

/** Linha do dy_results.sql (colunas usadas aqui; o arquivo guarda todas). */
export interface ResultRow {
  dados_ate: string;
  grao: 'usuario' | 'sessao';
  stream: 'web' | 'app';
  bu: string;
  campanha: string;
  device: string;
  variacao: string;
  is_controle: boolean;
  unidades: number;
  metrica_norte: string;
  status: string;
  p_srm: number | null;
  dias_leitura: number;
  usuarios_2_variantes: number | null;
  data_inicio_leitura: string;
  data_fim_leitura: string;
  [k: string]: unknown;
}

/** dy_results.sql → id do catálogo de métricas (frente 4). */
const METRIC_MAP: { col: string; metricId: string }[] = [
  { col: 'conversao', metricId: 'conversao' },
  { col: 'receita_por_unidade', metricId: 'receita_por_usuario' },
  { col: 'transacoes_por_unidade', metricId: 'transacoes_por_usuario' },
  { col: 'ticket', metricId: 'ticket_medio' },
  { col: 'receita_bruta_faturada_por_unidade', metricId: 'receita_faturada_por_usuario' },
  { col: 'margem2_por_unidade', metricId: 'margem_2_por_usuario' },
  { col: 'conversao_carrinho', metricId: 'conversao_carrinho' },
  { col: 'conversao_repet_nova', metricId: 'conversao_repet_nova' },
  { col: 'conversao_clube', metricId: 'conversao_clube' },
  { col: 'receita_clube_por_unidade', metricId: 'receita_clube_por_usuario' },
  { col: 'churn_clube', metricId: 'churn_clube' },
  { col: 'conversao_saude', metricId: 'conversao_saude' },
  { col: 'vidas_por_unidade', metricId: 'vidas_por_usuario' },
  { col: 'receita_saude_por_unidade', metricId: 'receita_saude_por_usuario' },
  { col: 'ticket_saude', metricId: 'ticket_saude' },
  { col: 'churn_saude', metricId: 'churn_saude' },
];

let cache: { generatedAt: string; rows: ResultRow[] } | undefined;

/** Após o sync (job ou POST /painel/dy-refresh), a próxima leitura vem do disco. */
export function invalidateResultsCache(): void {
  cache = undefined;
}

/** Id do catálogo correspondente à coluna de métrica do dy_results (ex.: norte). */
export function metricIdFromColumn(col: string): string {
  return METRIC_MAP.find((m) => m.col === col)?.metricId ?? 'receita_por_usuario';
}

export function hasRealResults(): boolean {
  return existsSync(RESULTS_PATH);
}

export function loadRows(): ResultRow[] {
  if (!hasRealResults()) return [];
  cache ??= JSON.parse(readFileSync(RESULTS_PATH, 'utf-8')) as { generatedAt: string; rows: ResultRow[] };
  return cache.rows;
}

/** Plataforma do contrato a partir do stream + device da linha. */
function platformsOf(row: ResultRow): MetricResult['platform'][] {
  if (row.device === 'Total') return row.stream === 'web' ? ['all', 'site'] : ['all'];
  if (row.device === 'iOS') return ['ios'];
  if (row.device === 'Android') return ['android'];
  return []; // Mobile/Desktop do web não têm slot no contrato (DECISAO-PENDENTE: granularidade)
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Converte as linhas de um teste em MetricResult[] para um faroId. */
export function rowsToMetricResults(faroId: string, rows: ResultRow[]): MetricResult[] {
  const out: MetricResult[] = [];
  for (const row of rows) {
    const grain = row.grao === 'sessao' ? 'session' : 'user';
    const variantKey = row.is_controle ? 'controle' : row.variacao;
    for (const platform of platformsOf(row)) {
      for (const { col, metricId } of METRIC_MAP) {
        const value = num(row[col]);
        if (value === undefined) continue;
        const probBetter = row.is_controle ? undefined : num(row[`p_vence_${col}`]);
        out.push({
          faroId,
          metricId,
          platform,
          grain,
          variantKey,
          value,
          n: row.unidades,
          ...(row.is_controle ? {} : { deltaRelative: num(row[`uplift_${col}`]) }),
          ...(probBetter !== undefined ? { probBetter, label: labelFor(probBetter) } : {}),
          ...(num(row[`mde_${col}`]) !== undefined ? { mde: num(row[`mde_${col}`]) } : {}),
          asOf: String(row.dados_ate),
        });
      }
    }
  }
  return out;
}

/** Vincula linhas a um experimento pelo nome da campanha no DY (ou da importação de legado). */
export function rowsForExperiment(exp: Experiment, rows = loadRows()): ResultRow[] {
  const names = new Set(
    [exp.dy?.campaignName, exp.name].filter((n): n is string => !!n).map((n) => n.trim().toLowerCase()),
  );
  return rows.filter((r) => names.has(r.campanha.trim().toLowerCase()));
}

/** MetricResult reais de todos os experimentos vinculáveis (para o painel). */
export function realMetricResults(experiments: Experiment[]): MetricResult[] {
  if (!hasRealResults()) return [];
  const rows = loadRows();
  return experiments.flatMap((e) => rowsToMetricResults(e.faroId, rowsForExperiment(e, rows)));
}

export interface ResultsPayload {
  faroId: string;
  source: 'dy_results' | 'fixture';
  asOf?: string;
  readingWindow?: { start: string; end: string; days: number };
  srmPValue?: number | null;
  contaminatedUsers?: number | null;
  norte?: string;
  results: MetricResult[];
  /** Recomendação do motor (variante → texto), vinda do dy_results.sql. */
  recommendations: { variant: string; grain: string; device: string; recommendation: string }[];
  synthesis?: string;
}

/** MET-14 (parcial): payload de GET /results/:faroId a partir dos dados reais. */
export function resultsForExperiment(exp: Experiment): ResultsPayload | undefined {
  const rows = rowsForExperiment(exp);
  if (!rows.length) return undefined;
  const norteCol = String(rows[0]!.metrica_norte ?? 'receita_por_unidade');
  const recommendations = rows
    .filter((r) => !r.is_controle)
    .map((r) => ({
      variant: r.variacao,
      grain: r.grao,
      device: r.device,
      recommendation: String(r[`recomendacao_${norteCol}`] ?? 'Sem dado'),
    }));
  const total = rows.find((r) => r.device === 'Total' && r.grao === 'usuario');
  const bestVariant = rows
    .filter((r) => !r.is_controle && r.device === 'Total' && r.grao === 'usuario')
    .sort((a, b) => (num(b[`p_vence_${norteCol}`]) ?? 0) - (num(a[`p_vence_${norteCol}`]) ?? 0))[0];
  const synthesis = bestVariant
    ? `NORTE (${norteCol}): “${bestVariant.variacao}” com uplift ${(Number(bestVariant[`uplift_${norteCol}`] ?? 0) * 100).toFixed(1)}% e chance de ser melhor ${(Number(bestVariant[`p_vence_${norteCol}`] ?? 0) * 100).toFixed(0)}%. Recomendação: ${String(bestVariant[`recomendacao_${norteCol}`] ?? 'sem dado')}.`
    : undefined;
  return {
    faroId: exp.faroId,
    source: 'dy_results',
    asOf: total ? String(total.dados_ate) : undefined,
    readingWindow: total
      ? { start: String(total.data_inicio_leitura), end: String(total.data_fim_leitura), days: total.dias_leitura }
      : undefined,
    srmPValue: total?.p_srm ?? null,
    contaminatedUsers: total?.usuarios_2_variantes ?? null,
    norte: norteCol,
    results: rowsToMetricResults(exp.faroId, rows),
    recommendations,
    synthesis,
  };
}
