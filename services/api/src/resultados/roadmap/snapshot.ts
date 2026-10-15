// E8 — grava os snapshots em data/snapshots/roadmap/<dados_ate>/ e o latest.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROADMAP_SQL_VERSION } from '@faro/contracts';
import { SNAPSHOT_DIR } from './paths.ts';
import type { SnapshotMeta } from './types.ts';

export interface SnapshotRows {
  results: Record<string, unknown>[];
  discovery: Record<string, unknown>[];
  daily: Record<string, unknown>[];
}

export interface LatestJson extends SnapshotMeta {
  bytes: { results: number; discovery: number; daily: number };
  rows: { results: number; discovery: number; daily: number };
}

/** `dados_ate` = maior `data_fim_leitura` dos resultados; sem resultados, D-1 do relógio. */
export function dadosAte(results: Record<string, unknown>[], now = new Date()): string {
  const ends = results
    .map((r) => String(r.data_fim_leitura ?? ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (ends.length) return ends[ends.length - 1]!;
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

export function writeSnapshot(root: string, rows: SnapshotRows, meta: Omit<LatestJson, 'dir' | 'rows' | 'sqlVersion'>): LatestJson {
  const dir = resolve(root, SNAPSHOT_DIR, meta.dadosAte);
  mkdirSync(dir, { recursive: true });
  for (const k of ['results', 'discovery', 'daily'] as const) writeFileSync(resolve(dir, `${k}.json`), JSON.stringify(rows[k], null, 1) + '\n');
  const latest: LatestJson = {
    dir: meta.dadosAte,
    ...meta,
    sqlVersion: ROADMAP_SQL_VERSION,
    rows: { results: rows.results.length, discovery: rows.discovery.length, daily: rows.daily.length },
  };
  writeFileSync(resolve(root, SNAPSHOT_DIR, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');
  return latest;
}
