// E8 — cliente BigQuery (ADC) do sync do roadmap. Só o job importa este módulo; a API em si não
// precisa de credencial para servir os snapshots.
import { BigQuery } from '@google-cloud/bigquery';

export const PROJECT_ID = 'petlove-dataeng-prod-01';

export type Bq = Pick<BigQuery, 'createQueryJob' | 'query'>;

export function createClient(projectId = PROJECT_ID): Bq {
  return new BigQuery({ projectId });
}

export async function dryRunBytes(bq: Bq, sql: string): Promise<number> {
  const [job] = await bq.createQueryJob({ query: sql, dryRun: true });
  return Number(job.metadata.statistics?.totalBytesProcessed ?? 0);
}

/** Valores do cliente (BigQueryDate, Timestamp, BigInt) viram JSON simples. */
export function plain(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(plain);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === 'value') return plain(o.value);
    return Object.fromEntries(keys.map((k) => [k, plain(o[k])]));
  }
  return v;
}

export async function runQuery(bq: Bq, sql: string): Promise<Record<string, unknown>[]> {
  const [rows] = await bq.query({ query: sql });
  return (rows as unknown[]).map((r) => plain(r) as Record<string, unknown>);
}

export const gb = (bytes: number) => (bytes / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' GB';
