// Leitura de catálogos (mocks das frentes 3, 4 e 5) e criação de métrica rascunho (CFG-05).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../errors.ts';
import { slugMetricId } from '../mocks/metric-catalog.ts';
import type { Ports } from '../ports.ts';
import { requireActor } from '../http.ts';

const DraftMetricSchema = z
  .object({
    name: z.string().trim().min(3, 'Dê um nome com pelo menos 3 caracteres.').max(80),
    kind: z.enum(['proportion', 'mean']),
    definition: z.string().trim().min(10, 'Explique como a métrica é calculada.').max(400),
    baseline: z.number().positive('Informe a linha de base atual.'),
    stdDev: z.number().positive().optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (m.kind === 'proportion' && m.baseline >= 1)
      ctx.addIssue({ code: 'custom', path: ['baseline'], message: 'A taxa atual precisa ficar entre 0 e 100%.' });
    if (m.kind === 'mean' && !m.stdDev) ctx.addIssue({ code: 'custom', path: ['stdDev'], message: 'Informe o desvio padrão.' });
  });

export async function catalogRoutes(app: FastifyInstance, ports: Ports) {
  app.get('/catalog/metrics', async () => ports.metrics.list());
  app.post('/catalog/metrics', async (req, reply) => {
    const actor = requireActor(req);
    const input = DraftMetricSchema.parse(req.body);
    const all = await ports.metrics.list();
    const id = slugMetricId(input.name);
    if (all.some((m) => m.id === id || m.name.toLowerCase() === input.name.toLowerCase()))
      throw new HttpError(409, 'metrica_existente', 'Já existe uma métrica com esse nome.');
    reply.code(201);
    return ports.metrics.createDraft(input, actor);
  });
  app.get('/catalog/pages', async () => ports.audience.pageCatalog());
  app.get('/catalog/audiences', async () => ports.audience.shortcuts());
  app.get('/templates', async () => ports.templates.list());
}
