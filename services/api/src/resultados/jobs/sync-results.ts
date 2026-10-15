// Frente 4 — materializa os resultados reais dos testes (MET-14, interino).
// Roda data/models/results/dy_results.sql no BigQuery (exposições da ft_teste_ab,
// compras do ssot_ga4, ~10 GB em 45 dias) e grava services/api/.data/results.json.
// A API (GET /results/:faroId e o painel) lê esse arquivo quando ele existe.
//
// Uso: npm run job:sync-results [-- --dry-run]
// Também exposto como syncResults() para o POST /painel/dy-refresh.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT = 'petlove-dataeng-prod-01';
const SQL_PATH = fileURLToPath(new URL('../../../../../data/models/results/dy_results.sql', import.meta.url));
const OUT = fileURLToPath(new URL('../../../.data/results.json', import.meta.url));

export async function syncResults(): Promise<{ linhas: number; testes: number; segundos: number }> {
  const sql = readFileSync(SQL_PATH, 'utf-8');
  const bq = new BigQuery({ projectId: PROJECT });
  const start = Date.now();
  const [rows] = await bq.query({ query: sql });
  mkdirSync(dirname(OUT), { recursive: true });
  const normalize = (v: unknown): unknown => (v && typeof v === 'object' && 'value' in (v as object) ? (v as { value: unknown }).value : v);
  const plain = (rows as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalize(v)])));
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rows: plain }));
  const testes = new Set(plain.map((r) => r.campanha)).size;
  const segundos = Math.round((Date.now() - start) / 1000);
  console.log(`OK: ${plain.length} linhas de ${testes} testes em ${segundos}s -> ${OUT}`);
  return { linhas: plain.length, testes, segundos };
}

async function cli() {
  if (process.argv.includes('--dry-run')) {
    const sql = readFileSync(SQL_PATH, 'utf-8');
    const bq = new BigQuery({ projectId: PROJECT });
    const [job] = await bq.createQueryJob({ query: sql, dryRun: true });
    console.log(`dry run OK (${job.metadata.statistics.totalBytesProcessed ?? '?'} bytes)`);
    return;
  }
  await syncResults();
}

// Só roda como CLI (npm run job:sync-results); importado pela API, apenas exporta a função.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  cli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
