// Frente 3 — rotas do público-alvo (ajuste de produto 14/10): a etapa "Público-alvo"
// do wizard mostra a query de segmentação do atalho e processa a estimativa real
// (dry run de custo e, sob demanda, contagem) no BigQuery.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AudienceRuleSchema, type AudienceShortcut } from '@faro/contracts';
import { HttpError } from '../errors.ts';
import { requireActor } from '../http.ts';
import { addCustomShortcut, allShortcuts } from './custom.ts';
import { BASE_CLIENTES, buildShortcut, ImportPayloadSchema, planImport, verifySqlSegments } from './import.ts';
import { audienceRuleToSql, PROJECT } from './rule-sql.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

function sqlFor(a: AudienceShortcut): { sql: string; source: 'rule' | 'sqlRef' | 'sql' } | undefined {
  if (a.sqlRef) {
    const raw = readFileSync(join(REPO_ROOT, a.sqlRef), 'utf-8');
    return { sql: raw, source: 'sqlRef' };
  }
  if (a.sql) return { sql: a.sql, source: 'sql' };
  if (a.rule) return { sql: audienceRuleToSql(AudienceRuleSchema.parse(a.rule)), source: 'rule' };
  return undefined;
}

/** Colunas do resultado de uma query (dry run, sem custo): confere o grão exigido do segmento. */
async function dryRunColumns(sql: string): Promise<string[]> {
  const { BigQuery } = await import('@google-cloud/bigquery');
  const bq = new BigQuery({ projectId: PROJECT });
  const [job] = await bq.createQueryJob({ query: sql, dryRun: true });
  const fields = (job.metadata.statistics?.query?.schema?.fields ?? []) as { name: string }[];
  return fields.map((f) => f.name);
}

function countable(sql: string): string {
  return `SELECT COUNT(*) AS clientes FROM (\n${sql.replace(/;\s*$/, '')}\n)`;
}

export async function publicoRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/publico/audiences/:id/sql', async (req) => {
    requireActor(req);
    const shortcut = allShortcuts().find((s) => s.id === req.params.id);
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
    const shortcut = allShortcuts().find((s) => s.id === req.params.id);
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

  // ---- Tela /segmento (ajuste de produto 15/10): catálogo + criação com volumetria ----

  app.get('/publico/audiences', async (req) => {
    requireActor(req);
    return allShortcuts().map((s) => ({
      ...s,
      origem: s.sqlRef ? 'sql-versionado' : s.sql ? 'sql-livre' : s.rule ? 'regra' : 'manual',
    }));
  });

  const PreviewInput = z.object({ rule: AudienceRuleSchema, run: z.boolean().optional() });
  app.post('/publico/audiences/preview', async (req) => {
    requireActor(req);
    const { rule, run } = PreviewInput.parse(req.body ?? {});
    let sql: string;
    try {
      sql = audienceRuleToSql(rule);
    } catch (e) {
      throw new HttpError(422, 'regra_invalida', (e as Error).message);
    }
    try {
      const { BigQuery } = await import('@google-cloud/bigquery');
      const bq = new BigQuery({ projectId: PROJECT });
      const [job] = await bq.createQueryJob({ query: sql, dryRun: true });
      const gigabytes = Math.round((Number(job.metadata.statistics.totalBytesProcessed) / 1e9) * 10) / 10;
      if (!run) return { sql, gigabytes };
      const [rows] = await bq.query({ query: countable(sql) });
      const clientes = Number((rows[0] as { clientes: number }).clientes);
      return { sql, gigabytes, clientes, share: Math.round((clientes / BASE_CLIENTES) * 10000) / 10000 };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(503, 'bigquery_indisponivel', `Não foi possível consultar o BigQuery: ${(e as Error).message}`);
    }
  });

  const CreateInput = z.object({
    name: z.string().trim().min(4, 'Dê um nome com pelo menos 4 caracteres.').max(80),
    rule: AudienceRuleSchema,
    clientes: z.number().int().nonnegative().optional(),
    share: z.number().min(0).max(1).optional(),
  });
  app.post('/publico/audiences', async (req, reply) => {
    requireActor(req);
    const input = CreateInput.parse(req.body ?? {});
    const shortcut = buildShortcut(input);
    try {
      reply.code(201);
      // Aprovado: entra no catálogo e, por consequência, na etapa de Público do wizard.
      return addCustomShortcut(shortcut);
    } catch (e) {
      throw new HttpError(409, 'segmento_existente', (e as Error).message);
    }
  });

  // Segmentos montados e aprovados fora do app (artefato "Segmentos"): a regra é
  // revalidada e o SQL regenerado aqui; o que já existe ou não compila é devolvido
  // em `ignorados` sem derrubar o restante do lote.
  app.post('/publico/audiences/import', async (req) => {
    requireActor(req);
    const parsed = ImportPayloadSchema.safeParse(req.body);
    if (!parsed.success)
      throw new HttpError(400, 'formato_invalido', 'Envie uma lista de segmentos ou { "segmentos": [...] }.');
    if (!parsed.data.length) throw new HttpError(400, 'lote_vazio', 'Nenhum segmento no JSON.');
    const plan = await verifySqlSegments(planImport(parsed.data, allShortcuts()), dryRunColumns);
    return { importados: plan.novos.map((s) => addCustomShortcut(s)), ignorados: plan.ignorados };
  });
}
