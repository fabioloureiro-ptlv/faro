import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { resultsResponseSchema, type Experiment, type ResultsResponse } from '@faro/contracts';
import { createResultsSource } from '../src/resultados/roadmap/source.ts';
import { PM, setup, type Ctx } from './helpers.ts';

let ctx: Ctx;
afterEach(async () => ctx?.close());

const fx = new URL('./fixtures/roadmap/', import.meta.url);
const meta = { dir: '2026-10-12', dadosAte: '2026-10-12', fetchedAt: '2026-10-15T18:00:00.000Z', sqlVersion: 'v3 (2026-10-11)' };
function tmpSnapshot(): string {
  const tmp = mkdtempSync(resolve(tmpdir(), 'faro-route-'));
  mkdirSync(resolve(tmp, 'data/snapshots/roadmap/2026-10-12'), { recursive: true });
  for (const f of ['results', 'discovery', 'daily']) writeFileSync(resolve(tmp, 'data/snapshots/roadmap/2026-10-12', `${f}.json`), readFileSync(new URL(`${f}.json`, fx)));
  writeFileSync(resolve(tmp, 'data/snapshots/roadmap/latest.json'), JSON.stringify({ ...meta, bytes: { results: 1, discovery: 1, daily: 1 }, rows: { results: 18, discovery: 3, daily: 28 } }));
  return tmp;
}
const get = (url: string) => ctx.app.inject({ url, headers: PM });

describe('GET /results/:faroId com fixtures (MET-14)', () => {
  it('Nexus: ResultsResponse completo da fixture, com recorte por plataforma e grão', async () => {
    ctx = await setup({ seed: true });
    expect((await get('/health')).json()).toEqual({ ok: true, results: { source: 'fixtures' } });
    const res = await get('/results/FARO-2026-0001');
    expect(res.statusCode).toBe(200);
    const r = res.json() as ResultsResponse;
    expect(resultsResponseSchema.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({ faroId: 'FARO-2026-0001', source: 'fixtures', grain: 'user', platforms: ['all', 'android', 'ios'] });
    expect(r.results.every((x) => x.platform === 'all')).toBe(true);
    const ios = (await get('/results/FARO-2026-0001?platform=ios')).json() as ResultsResponse;
    expect(ios.results.length).toBeGreaterThan(0);
    expect(ios.results.every((x) => x.platform === 'ios')).toBe(true);
    const site = (await get('/results/FARO-2026-0001?platform=site')).json() as ResultsResponse;
    expect(site.results).toEqual([]);
    expect(site.notes?.at(-1)).toContain('não disponível');
  });

  it('exemplo da frente 2: montado a partir de MetricResult e saúde das fixtures', async () => {
    ctx = await setup({ seed: true });
    const r = (await get('/results/FARO-2026-0004')).json() as ResultsResponse;
    expect(resultsResponseSchema.safeParse(r).success).toBe(true);
    expect(r.source).toBe('fixtures');
    expect(r.variants.map((v) => v.key)).toEqual(['controle', 'a']);
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.srm.alert).toBe(true); // cenário SRM do protótipo
    expect(r.recommendation.code).toBe('investigar_srm');
    expect(r.volumes).toEqual([]);
  });

  it('rascunho recém-criado: sem leitura (aguardando dados); entradas inválidas', async () => {
    // Banco semeado: o rascunho novo recebe um faroId sem fixture da frente 2 (num banco vazio ele
    // receberia FARO-2026-0001 e herdaria os números do Nexus, como o painel já faz).
    ctx = await setup({ seed: true });
    const created = (await ctx.app.inject({ method: 'POST', url: '/experiments', headers: PM, payload: {} })).json() as { experiment: Experiment };
    const draft = await get(`/results/${created.experiment.faroId}`);
    expect(draft.statusCode).toBe(200);
    const d = draft.json() as ResultsResponse;
    expect(resultsResponseSchema.safeParse(d).success).toBe(true);
    expect(d).toMatchObject({ source: 'fixtures', results: [], volumes: [], recommendation: { code: 'aguardando_dados' } });
    expect((await get('/results/FARO-2026-0001?grain=dia')).statusCode).toBe(400);
    expect((await get('/results/abc')).statusCode).toBe(400);
    expect((await get('/results/FARO-2026-0999')).statusCode).toBe(404);
    expect((await ctx.app.inject({ url: '/results/FARO-2026-0001' })).statusCode).toBe(401);
  });
});

describe('GET /results/:faroId com snapshot do roadmap (E8)', () => {
  it('fonte roadmap: Nexus do snapshot, descobertos no painel e na API, fixture para quem não está no snapshot', async () => {
    ctx = await setup({ seed: true, resultsSource: createResultsSource({ root: tmpSnapshot() }) });
    expect((await get('/health')).json()).toMatchObject({ ok: true, results: { source: 'roadmap', snapshot: meta } });

    const android = (await get('/results/FARO-2026-0001?platform=android')).json() as ResultsResponse;
    expect(android.source).toBe('roadmap');
    expect(android.results.find((x) => x.metricId === 'receita_por_usuario' && x.variantKey === 'home_nova')).toMatchObject({ platform: 'android', value: 80.23 });
    expect(android.recommendation.code).toBe('implementar');

    const painel = (await get('/painel')).json() as { experiments: Experiment[]; norteResults: { faroId: string; variantKey: string }[] };
    const discovered = painel.experiments.filter((e) => e.faroId.startsWith('FARO-0000-'));
    expect(discovered.map((e) => [e.faroId, e.name])).toEqual([
      ['FARO-0000-0001', 'Cupom de primeira compra no checkout'],
      ['FARO-0000-0002', 'Teste Banner Home'],
    ]);
    // NORTE real do Nexus substitui a fixture no painel (chave do controle = "controle")
    expect(painel.norteResults.filter((r) => r.faroId === 'FARO-2026-0001').map((r) => r.variantKey)).toEqual(expect.arrayContaining(['controle', 'home nova']));

    const banner = (await get('/results/FARO-0000-0002')).json() as ResultsResponse;
    expect(banner.source).toBe('roadmap');
    expect(banner.recommendation.code).toBe('investigar_srm');
    expect((await get('/painel/experiments/FARO-0000-0001')).statusCode).toBe(200);

    // exemplo semeado sem campanha no snapshot: continua vindo das fixtures
    const exemplo = (await get('/results/FARO-2026-0004')).json() as ResultsResponse;
    expect(exemplo.source).toBe('fixtures');
  });
});
