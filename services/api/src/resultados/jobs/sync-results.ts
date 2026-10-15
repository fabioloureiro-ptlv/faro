// Frente 4 — materializa os resultados reais dos testes (MET-14, interino).
// Roda data/models/results/dy_results.sql no BigQuery (exposições da ft_teste_ab,
// compras do ssot_ga4, ~10 GB em 45 dias) e grava services/api/.data/results.json.
// A API (GET /results/:faroId e o painel) lê esse arquivo quando ele existe.
//
// Uso: npm run job:sync-results [-- --dry-run]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT = 'petlove-dataeng-prod-01';
const SQL_PATH = fileURLToPath(new URL('../../../../../data/models/results/dy_results.sql', import.meta.url));
const OUT = fileURLToPath(new URL('../../../.data/results.json', import.meta.url));

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sql = readFileSync(SQL_PATH, 'utf-8');
  const bq = new BigQuery({ projectId: PROJECT });

  if (dryRun) {
    const [job] = await bq.createQueryJob({ query: sql, dryRun: true });
    console.log(`dry run OK (${job.metadata.statistics.totalBytesProcessed ?? '?'} bytes)`);
    return;
  }

  const start = Date.now();
  const [rows] = await bq.query({ query: sql });
  mkdirSync(dirname(OUT), { recursive: true });
  const normalize = (v: unknown): unknown => (v && typeof v === 'object' && 'value' in (v as object) ? (v as { value: unknown }).value : v);
  const plain = (rows as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalize(v)])));
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), rows: plain }));
  const campanhas = new Set(plain.map((r) => r.campanha)).size;
  console.log(`OK: ${plain.length} linhas de ${campanhas} testes em ${((Date.now() - start) / 1000).toFixed(0)}s -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
