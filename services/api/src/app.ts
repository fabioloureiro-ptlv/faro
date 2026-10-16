import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { Db } from './db/client.ts';
import { HttpError } from './errors.ts';
import { catalogRoutes } from './catalog/routes.ts';
import { experimentRoutes } from './experiments/routes.ts';
import { createExperimentService } from './experiments/service.ts';
import { painelRoutes } from './painel/routes.ts';
import { resultadosRoutes } from './resultados/routes.ts';
import { getResultsSource } from './resultados/roadmap/source.ts';
import { fileDyExport, hasDyExportFile } from './adapters/dy-export-file.ts';
import { anuncioPortsFromEnv } from './anuncio/clients.ts';
import { anuncioRoutes } from './anuncio/routes.ts';
import { mockDyExport } from './mocks/dy-export.ts';
import { mockMetricCatalog } from './mocks/metric-catalog.ts';
import { audiencePort, overlapPort } from './publico/engine.ts';
import { publicoRoutes } from './publico/routes.ts';
import { templatesPort } from './templates/library.ts';
import { testesAbRoutes } from './testes-ab/routes.ts';
import type { Ports } from './ports.ts';

export function defaultPorts(db: Db, now: () => Date = () => new Date()): Ports {
  return {
    metrics: mockMetricCatalog(db, now),
    // Frente 3 real (unificação): públicos e sobreposição saem de src/publico.
    audience: audiencePort(),
    overlap: overlapPort(),
    // Frente 5 real (unificação): biblioteca de templates como dados.
    templates: templatesPort(),
    // Export real quando o sync já rodou (npm run job:sync-dy); mock caso contrário.
    dyExport: hasDyExportFile() ? fileDyExport() : mockDyExport(),
    // Slack (webhook) e Jira (REST) só quando as variáveis FARO_SLACK_* / FARO_JIRA_* existem.
    anuncio: anuncioPortsFromEnv(),
    now,
  };
}

export async function buildApp(db: Db, ports: Ports, opts: { logger?: boolean; corsOrigin?: string[] } = {}): Promise<FastifyInstance> {
  // Logs sem corpo de requisição: nada de dado pessoal em log.
  const app = Fastify({ logger: opts.logger ?? false });
  await app.register(cors, { origin: opts.corsOrigin ?? false, methods: ['GET', 'POST', 'PATCH'] });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError)
      return reply.code(err.status).send({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
    if (err instanceof ZodError)
      return reply.code(400).send({
        error: 'entrada_invalida',
        message: 'Há campos inválidos.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'requisicao_invalida', message: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'erro_interno', message: 'Erro inesperado. Tente de novo.' });
  });

  // E8: a fonte de resultados em uso (roadmap + snapshot, ou fixtures).
  app.get('/health', async () => ({ ok: true, results: getResultsSource().info() }));
  const svc = createExperimentService(db, ports);
  await experimentRoutes(app, svc, db);
  await anuncioRoutes(app, svc, db, ports);
  await catalogRoutes(app, ports);
  await painelRoutes(app, db);
  await resultadosRoutes(app, db);
  await publicoRoutes(app);
  await testesAbRoutes(app);
  return app;
}
