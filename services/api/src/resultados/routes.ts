// Frente 4 — API de resultados (MET-14): GET /results/:faroId?grain=&platform= devolve o
// ResultsResponse do contrato. Fonte roadmap (snapshot das consultas do Digital) quando houver;
// senão, fixtures (Nexus completo; demais a partir dos MetricResult da frente 2).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FaroIdSchema, grainSchema, platformOrAllSchema } from '@faro/contracts';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { requireActor } from '../http.ts';
import { buildDataset } from '../painel/dataset.ts';
import { fixtureResults } from './fixtures.ts';
import { buildResults } from './roadmap/adapter.ts';
import { getResultsSource } from './roadmap/source.ts';

const QuerySchema = z.object({ grain: grainSchema.optional(), platform: platformOrAllSchema.optional() });

export async function resultadosRoutes(app: FastifyInstance, db: Db) {
  app.get<{ Params: { faroId: string }; Querystring: Record<string, unknown> }>('/results/:faroId', async (req) => {
    requireActor(req);
    const parsed = FaroIdSchema.safeParse(req.params.faroId);
    if (!parsed.success) throw new HttpError(400, 'faro_id_invalido', 'faroId inválido.');
    const query = QuerySchema.safeParse(req.query);
    if (!query.success) throw new HttpError(400, 'entrada_invalida', 'grain aceita user|session e platform aceita all|site|android|ios.');

    // Experimentos cadastrados ∪ descobertos no DY (FARO-0000-…), métricas e fixtures da frente 2.
    const ds = await buildDataset(db);
    const exp = ds.experiments.find((e) => e.faroId === parsed.data);
    if (!exp) throw new HttpError(404, 'nao_encontrado', 'Experimento não encontrado');

    const snap = getResultsSource().snapshot();
    if (snap) {
      const real = buildResults(snap, exp, ds.metrics, query.data);
      if (real) return real;
    }
    return fixtureResults(
      {
        experiment: exp,
        metricResults: ds.metricResults.filter((r) => r.faroId === exp.faroId),
        health: ds.health.find((h) => h.faroId === exp.faroId),
        metrics: ds.metrics,
        asOf: ds.asOf,
      },
      query.data,
    );
  });
}
