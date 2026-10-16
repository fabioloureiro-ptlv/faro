// POST /experiments/:faroId/anunciar — manda o resumo do teste ao Slack (marcando o PM que preencheu) e
// abre o card no Jira com a ficha do DY. Só para teste já revisado (ficha disponível). Falha de um
// destino não impede o outro; a resposta diz o que aconteceu em cada um.
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.ts';
import { requireActor } from '../http.ts';
import type { ExperimentService } from '../experiments/service.ts';
import type { Ports } from '../ports.ts';
import { anunciarExperimento } from './service.ts';

export type { AnuncioResult, DestinoStatus } from './service.ts';

export async function anuncioRoutes(
  app: FastifyInstance,
  svc: ExperimentService,
  db: Db,
  ports: Ports,
) {
  app.post<{ Params: { faroId: string } }>('/experiments/:faroId/anunciar', async (req) => {
    const actor = requireActor(req);
    return anunciarExperimento(
      { svc, db, ports, log: (m) => req.log.warn({ faroId: req.params.faroId }, m) },
      req.params.faroId,
      actor,
    );
  });
}
