// Frente 4 (E8) — sincroniza as três consultas do roadmap do Digital com o cadastro do Faro injetado.
//
// Uso: npm run job:sync-roadmap -- [--campanha "<nome>"] [--dry-run]
//   --dry-run   monta as consultas, estima bytes no BigQuery e sai sem executar nem gravar
//   --campanha  define `campanha_alvo` nas consultas (results e daily ficam mais baratas)
//
// Lê o cadastro do banco local (PGlite em services/api/.data; pare a API antes), injeta nos marcadores
// -- {overrides}, -- {linked}, -- {split}, -- {norte} (ver data/queries/roadmap/README.md), roda no
// BigQuery com ADC, recusa gravar se houver coluna de identificador e grava
// data/snapshots/roadmap/<dados_ate>/{results,discovery,daily}.json + latest.json (gitignored).
// Custo de referência: ~30 GB por execução completa. Sem agendamento: roda sob demanda.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Experiment } from '@faro/contracts';
import { createDbFromEnv } from '../../db/client.ts';
import { listExperiments } from '../../experiments/repository.ts';
import { createClient, dryRunBytes, gb, runQuery, type Bq } from '../roadmap/bigquery.ts';
import { buildQueries, type QueryTemplates } from '../roadmap/inject.ts';
import { QUERY_FILES, REPO_ROOT } from '../roadmap/paths.ts';
import { privacyViolations } from '../roadmap/privacy.ts';
import { dadosAte, writeSnapshot, type LatestJson } from '../roadmap/snapshot.ts';

export function loadTemplates(root = REPO_ROOT): QueryTemplates {
  const missing = Object.values(QUERY_FILES).filter((f) => !existsSync(resolve(root, f)));
  if (missing.length)
    throw new Error(
      `consultas ausentes: ${missing.join(', ')}. Salve o texto recebido de Marketing Data (MS-5638) em data/queries/roadmap/ mantendo os marcadores -- {overrides}, -- {linked}, -- {split}, -- {norte} (ver o README da pasta).`,
    );
  const read = (f: string) => readFileSync(resolve(root, f), 'utf8');
  return { results: read(QUERY_FILES.results), discovery: read(QUERY_FILES.discovery), daily: read(QUERY_FILES.daily) };
}

export interface SyncOptions {
  campanha?: string;
  dryRun?: boolean;
  root?: string;
  bq?: Bq;
  log?: (line: string) => void;
}

export interface SyncResult {
  bytes: { results: number; discovery: number; daily: number };
  warnings: string[];
  latest?: LatestJson;
}

export async function syncRoadmap(experiments: Experiment[], opts: SyncOptions = {}): Promise<SyncResult> {
  const root = opts.root ?? REPO_ROOT;
  const log = opts.log ?? ((l: string) => console.log(l));
  const built = buildQueries(loadTemplates(root), experiments, { campanha: opts.campanha });
  for (const w of built.warnings) log(`aviso: ${w}`);

  const bq = opts.bq ?? createClient();
  const bytes = { results: 0, discovery: 0, daily: 0 };
  for (const k of ['discovery', 'results', 'daily'] as const) bytes[k] = await dryRunBytes(bq, built[k]);
  const total = bytes.results + bytes.discovery + bytes.daily;
  log(`estimativa (dry run)${opts.campanha ? ` · campanha_alvo = ${opts.campanha}` : ''}`);
  for (const k of ['discovery', 'results', 'daily'] as const) log(`  ${k.padEnd(10)} ${gb(bytes[k])}`);
  log(`  ${'total'.padEnd(10)} ${gb(total)}`);
  if (opts.dryRun) return { bytes, warnings: built.warnings };

  const rows = { discovery: await runQuery(bq, built.discovery), results: await runQuery(bq, built.results), daily: await runQuery(bq, built.daily) };
  const violations = [
    ...privacyViolations(rows.results, 'results.'),
    ...privacyViolations(rows.discovery, 'discovery.'),
    ...privacyViolations(rows.daily, 'daily.'),
  ];
  if (violations.length) throw new Error(`snapshot não gravado: identificadores no resultado — ${violations.join('; ')}`);
  const latest = writeSnapshot(root, rows, {
    dadosAte: dadosAte(rows.results),
    fetchedAt: new Date().toISOString(),
    bytes,
    ...(opts.campanha ? { campanha: opts.campanha } : {}),
  });
  log(
    `snapshot gravado em data/snapshots/roadmap/${latest.dir}/ (results ${latest.rows.results}, discovery ${latest.rows.discovery}, daily ${latest.rows.daily} linhas); latest.json atualizado`,
  );
  return { bytes, warnings: built.warnings, latest };
}

async function cli() {
  const { values } = parseArgs({ options: { campanha: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  const campanha = values.campanha?.trim();
  if (values.campanha !== undefined && !campanha) throw new Error('--campanha precisa de um nome');
  const dataDir = process.env.FARO_DATA_DIR ?? fileURLToPath(new URL('../../../.data/pglite', import.meta.url));
  const { db, close } = await createDbFromEnv(dataDir);
  try {
    const experiments = await listExperiments(db);
    console.log(`cadastro: ${experiments.length} experimentos, ${experiments.filter((e) => e.dy?.campaignName).length} com campanha no DY`);
    await syncRoadmap(experiments, { campanha, dryRun: values['dry-run'] ?? false });
  } finally {
    await close();
  }
}

// Só roda como CLI (npm run job:sync-roadmap); importado, apenas exporta as funções.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  cli().catch((e: Error) => {
    console.error(`erro: ${e.message}`);
    process.exit(1);
  });
}
