import type { FastifyInstance } from 'fastify';
import type { Experiment } from '@faro/contracts';
import { buildApp, defaultPorts } from '../src/app.ts';
import { createDb, type Db } from '../src/db/client.ts';
import { mockDyExport } from '../src/mocks/dy-export.ts';
import { seedFixtures } from '../src/seed.ts';
import type { Ports } from '../src/ports.ts';

export const PM = { 'x-faro-user': 'pm@example.com' };

export async function setup(opts: { seed?: boolean } = {}) {
  const { db, close } = await createDb();
  if (opts.seed) await seedFixtures(db);
  const dyExport = mockDyExport();
  let now = new Date('2026-10-14T13:00:00Z');
  const ports: Ports = { ...defaultPorts(db, () => now), dyExport };
  const app = await buildApp(db, ports);
  return {
    app,
    db,
    ports,
    dyExport,
    setNow: (d: string) => (now = new Date(d)),
    close: async () => {
      await app.close();
      await close();
    },
  };
}

export type Ctx = Awaited<ReturnType<typeof setup>>;

export async function createDraft(app: FastifyInstance, body: object = {}) {
  const res = await app.inject({ method: 'POST', url: '/experiments', headers: PM, payload: body });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json() as { experiment: Experiment; derived: Record<string, unknown> };
}

export async function patch(app: FastifyInstance, faroId: string, payload: object, headers: Record<string, string> = PM) {
  return app.inject({ method: 'PATCH', url: `/experiments/${faroId}`, headers, payload });
}

export const completeDesign: Experiment['design'] = {
  context:
    'Dados de busca mostram que 38% das sessões que buscam ração terminam sem clique em produto, e o prazo é o 2º motivo de reclamação.',
  hypothesis: {
    change: 'mostrarmos o selo “chega amanhã” nos cards da busca',
    expectedEffect: 'a conversão para o carrinho vai aumentar',
    because: 'o cliente sabe o prazo antes de abrir o produto',
  },
  control: { name: 'Controle', description: 'Card da busca sem informação de entrega' },
  variants: [{ key: 'a', name: 'Variante A', description: 'Card com selo “Chega amanhã”' }],
  primaryMetricId: 'conversao_carrinho',
  secondaryMetricIds: ['conversao', 'receita_por_usuario'],
  guardrailMetricIds: ['tempo_carregamento'],
  mdeRelative: 0.05,
};

export const okAllocation: Experiment['allocation'] = {
  platforms: ['site', 'android', 'ios'],
  pages: ['busca'],
  trafficPercent: 50,
  split: [0.5, 0.5],
  startDate: '2026-10-19',
  endDate: '2026-11-30',
};

/** Rascunho com design e público completos, pronto para a revisão. */
export async function readyDraft(ctx: Ctx, alloc: Partial<Experiment['allocation']> = {}) {
  const { experiment } = await createDraft(ctx.app);
  const res = await patch(ctx.app, experiment.faroId, {
    name: 'Selo de entrega rápida na busca',
    ownerSquad: 'Squad Descoberta',
    design: completeDesign,
    allocation: { ...okAllocation, ...alloc },
  });
  if (res.statusCode !== 200) throw new Error(res.body);
  return res.json() as { experiment: Experiment; derived: { ready: boolean; unlockedSteps: number[] } & Record<string, unknown> };
}

export type { Db };
