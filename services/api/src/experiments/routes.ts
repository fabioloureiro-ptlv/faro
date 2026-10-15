import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dySheetToMarkdown } from '@faro/config-core';
import { requireActor } from '../http.ts';
import type { Db } from '../db/client.ts';
import { listAudit, listEvents } from './repository.ts';
import { CreateInputSchema, type ExperimentService } from './service.ts';

type Params = { faroId: string };

export async function experimentRoutes(app: FastifyInstance, svc: ExperimentService, db: Db) {
  app.get('/experiments', async () => svc.list());

  app.post('/experiments', async (req, reply) => {
    const actor = requireActor(req);
    reply.code(201);
    return svc.create(CreateInputSchema.parse(req.body ?? {}), actor);
  });

  app.post('/experiments/import-legacy', async (req, reply) => {
    const actor = requireActor(req);
    reply.code(201);
    return svc.importLegacy(req.body, actor);
  });

  // Rota estática antes da rota com parâmetro, para não casar como :faroId.
  app.get('/experiments/dy-campaigns', async () => svc.listDyCampaigns());

  app.get<{ Params: Params }>('/experiments/:faroId', async (req) => svc.get(req.params.faroId));

  app.patch<{ Params: Params }>('/experiments/:faroId', async (req) => svc.patch(req.params.faroId, req.body ?? {}, requireActor(req)));

  app.post<{ Params: Params }>('/experiments/:faroId/ready', async (req) => {
    requireActor(req);
    return svc.ready(req.params.faroId);
  });

  app.get<{ Params: Params; Querystring: { format?: string } }>('/experiments/:faroId/dy-sheet', async (req, reply) => {
    const sheet = await svc.dySheet(req.params.faroId);
    if (req.query.format === 'md') {
      reply
        .type('text/markdown; charset=utf-8')
        .header('content-disposition', `attachment; filename="ficha-dy-${sheet.faroId}.md"`);
      return dySheetToMarkdown(sheet);
    }
    return sheet;
  });

  app.post<{ Params: Params }>('/experiments/:faroId/dy-confirmation', async (req) =>
    svc.confirm(req.params.faroId, req.body, requireActor(req)),
  );

  app.post<{ Params: Params }>('/experiments/:faroId/duplicate', async (req, reply) => {
    const actor = requireActor(req);
    reply.code(201);
    return svc.duplicate(req.params.faroId, actor);
  });

  app.get<{ Params: Params }>('/experiments/:faroId/audit', async (req) => listAudit(db, req.params.faroId));

  const EventsQuery = z.object({ after: z.coerce.number().int().min(0).optional(), faroId: z.string().optional() });
  app.get('/events', async (req) => {
    const q = EventsQuery.parse(req.query);
    return listEvents(db, { ...(q.after ? { afterId: q.after } : {}), ...(q.faroId ? { faroId: q.faroId } : {}) });
  });
}
