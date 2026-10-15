// Frente 4 — API de resultados (MET-14, parcial): serve a leitura real do teste
// quando o sync já rodou; senão cai nas fixtures (Nexus e simulados).
import type { FastifyInstance } from 'fastify';
import { FaroIdSchema } from '@faro/contracts';
import type { Db } from '../db/client.ts';
import { HttpError } from '../errors.ts';
import { requireActor } from '../http.ts';
import { getExperiment } from '../experiments/repository.ts';
import { buildDataset } from '../painel/dataset.ts';
import { resultsForExperiment } from './results.ts';

export async function resultadosRoutes(app: FastifyInstance, db: Db) {
  app.get<{ Params: { faroId: string } }>('/results/:faroId', async (req) => {
    requireActor(req);
    const parsed = FaroIdSchema.safeParse(req.params.faroId);
    if (!parsed.success) throw new HttpError(400, 'faro_id_invalido', 'faroId inválido.');
    const exp = await getExperiment(db, parsed.data);
    if (!exp) throw new HttpError(404, 'nao_encontrado', 'Experimento não encontrado');

    const real = resultsForExperiment(exp);
    if (real) return real;

    const ds = await buildDataset(db);
    return {
      faroId: exp.faroId,
      source: 'fixture',
      norte: exp.design.primaryMetricId,
      results: ds.metricResults.filter((r) => r.faroId === exp.faroId),
      recommendations: [],
    };
  });
}
