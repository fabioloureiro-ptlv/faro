// E8 — seleção da fonte de resultados. FARO_SOURCE=roadmap|fixtures; sem a variável, roadmap quando
// houver snapshot (data/snapshots/roadmap/latest.json, do job:sync-roadmap) ou a saída interina do
// job:sync-results (services/api/.data/results.json, só a consulta de resultados); senão, fixtures.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROADMAP_SQL_VERSION, type ResultsSource as ResultsSourceKind } from '@faro/contracts';
import { REPO_ROOT, RESULTS_PATH, SNAPSHOT_DIR } from './paths.ts';
import { dailyRowSchema, discoveryRowSchema, parseRows, resultsRowSchema, type RoadmapSnapshot, type SnapshotMeta } from './types.ts';

export interface ResultsSourceOptions {
  /** Força a fonte; sem valor, lê FARO_SOURCE. */
  source?: string;
  /** Raiz do repositório onde ficam data/snapshots/roadmap/. */
  root?: string;
  /** Saída do job:sync-results (só resultados). */
  resultsFile?: string;
}

export interface ResultsSourceInfo {
  source: ResultsSourceKind;
  snapshot?: SnapshotMeta;
}

export interface ResultsSource {
  /** Snapshot em uso; `undefined` na fonte fixtures. Cacheado até invalidate(). */
  snapshot(): RoadmapSnapshot | undefined;
  info(): ResultsSourceInfo;
  /** Após um sync (job ou POST /painel/dy-refresh), a próxima leitura vem do disco. */
  invalidate(): void;
}

export function snapshotFromRows(raw: { results: unknown; discovery: unknown; daily: unknown }, meta: SnapshotMeta): RoadmapSnapshot {
  return {
    results: parseRows(resultsRowSchema, raw.results, 'results.json'),
    discovery: parseRows(discoveryRowSchema, raw.discovery, 'discovery.json'),
    daily: parseRows(dailyRowSchema, raw.daily, 'daily.json'),
    meta,
  };
}

export function hasRoadmapSnapshot(root: string): boolean {
  return existsSync(resolve(root, SNAPSHOT_DIR, 'latest.json'));
}

/** Snapshot completo das três consultas (npm run job:sync-roadmap). */
export function loadRoadmapSnapshot(root: string): RoadmapSnapshot {
  const latest = JSON.parse(readFileSync(resolve(root, SNAPSHOT_DIR, 'latest.json'), 'utf8')) as SnapshotMeta;
  const dir = resolve(root, SNAPSHOT_DIR, latest.dir);
  const read = (f: string) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as unknown;
  return snapshotFromRows({ results: read('results.json'), discovery: read('discovery.json'), daily: read('daily.json') }, latest);
}

/** Saída do job interino (só dy_results.sql, com o cadastro do roadmap) lida como snapshot sem discovery nem daily. */
export function loadResultsFileSnapshot(file: string): RoadmapSnapshot {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { generatedAt?: string; rows: unknown };
  const results = parseRows(resultsRowSchema, raw.rows, 'results.json');
  const ends = results.map((r) => r.data_fim_leitura ?? '').filter(Boolean).sort();
  return {
    results,
    discovery: [],
    daily: [],
    meta: {
      dir: 'services/api/.data/results.json',
      dadosAte: ends[ends.length - 1] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      fetchedAt: raw.generatedAt ?? new Date(0).toISOString(),
      sqlVersion: ROADMAP_SQL_VERSION,
    },
  };
}

export function createResultsSource(opts: ResultsSourceOptions = {}): ResultsSource {
  const want = (opts.source ?? process.env.FARO_SOURCE ?? '').trim().toLowerCase();
  if (want && want !== 'roadmap' && want !== 'fixtures') throw new Error(`FARO_SOURCE inválido: ${want} (use roadmap ou fixtures)`);
  const root = opts.root ?? REPO_ROOT;
  const resultsFile = opts.resultsFile ?? RESULTS_PATH;
  let cache: { snap: RoadmapSnapshot | undefined } | undefined;

  const load = (): RoadmapSnapshot | undefined => {
    if (want === 'fixtures') return undefined;
    if (hasRoadmapSnapshot(root)) return loadRoadmapSnapshot(root);
    if (existsSync(resultsFile)) return loadResultsFileSnapshot(resultsFile);
    if (want === 'roadmap')
      throw new Error('FARO_SOURCE=roadmap, mas não há snapshot: rode npm run job:sync-roadmap (ou job:sync-results) ou use FARO_SOURCE=fixtures.');
    return undefined;
  };

  return {
    snapshot: () => (cache ??= { snap: load() }).snap,
    info() {
      const snap = this.snapshot();
      return snap ? { source: 'roadmap', snapshot: snap.meta } : { source: 'fixtures' };
    },
    invalidate: () => {
      cache = undefined;
    },
  };
}

let current: ResultsSource | undefined;

/** Fonte em uso pela API (singleton por processo; os testes trocam com setResultsSource). */
export function getResultsSource(): ResultsSource {
  return (current ??= createResultsSource());
}

export function setResultsSource(source: ResultsSource): void {
  current = source;
}
