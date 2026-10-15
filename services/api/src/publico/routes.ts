// Frente 3 — rotas do público-alvo (ajuste de produto 14/10): a etapa "Público-alvo"
// do wizard mostra a query de segmentação do atalho e processa a estimativa real
// (dry run de custo e, sob demanda, contagem) no BigQuery.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AudienceRuleSchema, AudienceShortcutSchema, type AudienceShortcut } from '@faro/contracts';
import audiences from '@faro/contracts/fixtures/audiences.json' with { type: 'json' };
import { HttpError } from '../errors.ts';
import { requireActor } from '../http.ts';
import { audienceRuleToSql, PROJECT } from './rule-sql.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const shortcuts: AudienceShortcut[] = (audiences as unknown[]).map((a) => AudienceShortcutSchema.parse(a));

function sqlFor(a: AudienceShortcut): { sql: string; source: 'rule' | 'sqlRef' } | undefined {
  if (a.sqlRef) {
    const raw = readFileSync(join(REPO_ROOT, a.sqlRef), 'utf-8');
    return { sql: raw, source: 'sqlRef' };
  }
  if (a.rule) return { sql: audienceRuleToSql(AudienceRuleSchema.parse(a.rule)), source: 'rule' };
  return undefined;
}

function countable(sql: string): string {
  return `SELECT COUNT(*) AS clientes FROM (\n${sql.replace(/;\s*$/, '')}\n)`;
}

export async function publicoRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/publico/audiences/:id/sql', async (req) => {
    requireActor(req);
    const shortcut = shortcuts.find((s) => s.id === req.params.id);
    if (!shortcut) throw new HttpError(404, 'publico_inexistente', 'Atalho de público não encontrado.');
    const built = sqlFor(shortcut);
    if (!built)
      throw new HttpError(404, 'sem_regra', 'Este público não tem regra nem SQL versionado; a estimativa é manual.');
    return { id: shortcut.id, ...built };
  });

  const EstimateInput = z.object({ run: z.boolean().optional() });
  app.post<{ Params: { id: string } }>('/publico/audiences/:id/estimate', async (req) => {
    requireActor(req);
    const { run } = EstimateInput.parse(req.body ?? {});
    const shortcut = shortcuts.find((s) => s.id === req.params.id);
    if (!shortcut) throw new HttpError(404, 'publico_inexistente', 'Atalho de público não encontrado.');
    const built = sqlFor(shortcut);
    if (!built)
      throw new HttpError(404, 'sem_regra', 'Este público não tem regra nem SQL versionado; a estimativa é manual.');

    try {
      const { BigQuery } = await import('@google-cloud/bigquery');
      const bq = new BigQuery({ projectId: PROJECT });
      const [job] = await bq.createQueryJob({ query: built.sql, dryRun: true });
      const gigabytes = Math.round((Number(job.metadata.statistics.totalBytesProcessed) / 1e9) * 10) / 10;
      if (!run) return { id: shortcut.id, sql: built.sql, gigabytes };
      const [rows] = await bq.query({ query: countable(built.sql) });
      return { id: shortcut.id, sql: built.sql, gigabytes, clientes: Number((rows[0] as { clientes: number }).clientes) };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(503, 'bigquery_indisponivel', `Não foi possível consultar o BigQuery: ${(e as Error).message}`);
    }
  });
}
