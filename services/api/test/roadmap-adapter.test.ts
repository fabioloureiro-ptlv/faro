import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ExperimentSchema, MetricDefinitionSchema, resultsResponseSchema, type Experiment, type MetricDefinition, type MetricResult, type ResultsResponse } from '@faro/contracts';
import metricsCatalog from '@faro/contracts/fixtures/metrics-catalog.json' with { type: 'json' };
import nexusFixture from '@faro/contracts/fixtures/nexus.json' with { type: 'json' };
import { buildResults, discoverExperiments, platformsAvailable, readWindowOrigin, slugKey } from '../src/resultados/roadmap/adapter.ts';
import { recommendationCode, translateRecommendation } from '../src/resultados/roadmap/recommend.ts';
import { createResultsSource, loadResultsFileSnapshot, snapshotFromRows } from '../src/resultados/roadmap/source.ts';

const fx = new URL('./fixtures/roadmap/', import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, fx), 'utf8')) as unknown;
const meta = { dir: '2026-10-12', dadosAte: '2026-10-12', fetchedAt: '2026-10-15T18:00:00.000Z', sqlVersion: 'v3 (2026-10-11)' };
const snap = snapshotFromRows({ results: read('results.json'), discovery: read('discovery.json'), daily: read('daily.json') }, meta);
const catalog: MetricDefinition[] = (metricsCatalog as unknown[]).map((m) => MetricDefinitionSchema.parse(m));
const nexus = ExperimentSchema.parse(nexusFixture.experiment) as Experiment;
const by = (r: ResultsResponse, metricId: string, variantKey: string): MetricResult =>
  r.results.find((x) => x.metricId === metricId && x.variantKey === variantKey)!;

/** Cópia da fixture sintética como snapshot completo em uma pasta temporária. */
function tmpSnapshot(): string {
  const tmp = mkdtempSync(resolve(tmpdir(), 'faro-roadmap-'));
  mkdirSync(resolve(tmp, 'data/snapshots/roadmap/2026-10-12'), { recursive: true });
  for (const f of ['results', 'discovery', 'daily']) writeFileSync(resolve(tmp, 'data/snapshots/roadmap/2026-10-12', `${f}.json`), readFileSync(new URL(`${f}.json`, fx)));
  writeFileSync(resolve(tmp, 'data/snapshots/roadmap/latest.json'), JSON.stringify({ ...meta, bytes: { results: 1, discovery: 1, daily: 1 }, rows: { results: 18, discovery: 3, daily: 28 } }));
  return tmp;
}

describe('adapter do roadmap (E8): carga e descoberta', () => {
  it('lê a fixture sintética com as três consultas', () => {
    expect(snap.results).toHaveLength(18);
    expect(snap.discovery).toHaveLength(3);
    expect(snap.daily).toHaveLength(28);
    expect(snap.results[0]!.is_controle).toBe(true);
  });

  it('campanhas sem cadastro viram experimentos legados FARO-0000-NNNN na ordem alfabética', () => {
    const found = discoverExperiments(snap, [nexus]);
    expect(found.map((e) => [e.faroId, e.name])).toEqual([
      ['FARO-0000-0001', 'Cupom de primeira compra no checkout'],
      ['FARO-0000-0002', 'Teste Banner Home'],
    ]);
    const [cupom, banner] = found as [Experiment, Experiment];
    expect(cupom).toMatchObject({ legacy: true, status: 'rodando', bu: 'ecom', ownerSquad: 'DY · não cadastrado', allocation: { platforms: ['site'], readWindow: { start: '2026-10-02', end: '2026-10-13' } } });
    expect(cupom.design.control.name).toBe('Controle');
    expect(cupom.design.variants).toEqual([{ key: 'cupom_aplicado_automaticamente', name: 'Cupom aplicado automaticamente', description: 'importado do DY, completar cadastro' }]);
    expect(cupom.design.primaryMetricId).toBe('conversao');
    expect(cupom.design.context).toMatch(/importado do DY/i);
    expect(cupom.allocation.split).toEqual([0.5, 0.5]);
    expect(banner).toMatchObject({ bu: 'servicos', allocation: { platforms: ['android', 'ios'] } });
    for (const e of found) expect(ExperimentSchema.safeParse(e).success).toBe(true);
    // vínculo pelo nome do teste também conta como cadastro
    expect(discoverExperiments(snap, [nexus, { ...nexus, faroId: 'FARO-2026-0009', name: 'teste banner home', dy: undefined }]).map((e) => e.name)).toEqual([
      'Cupom de primeira compra no checkout',
    ]);
  });

  it('slug, plataformas disponíveis e origem da janela', () => {
    expect(slugKey('Cupom aplicado automaticamente')).toBe('cupom_aplicado_automaticamente');
    expect(slugKey('home antiga')).toBe('home_antiga');
    expect(slugKey('Variação É')).toBe('variacao_e');
    expect(platformsAvailable(snap, 'Nexus | Nova Home do App', nexus)).toEqual(['all', 'android', 'ios']);
    expect(platformsAvailable(snap, 'Cupom de primeira compra no checkout')).toEqual(['all', 'site']);
    expect(readWindowOrigin('roadmap')).toBe('roadmap');
    expect(readWindowOrigin('detectado')).toBe('detectado');
    expect(readWindowOrigin('sem periodo estavel (periodo inteiro)')).toBe('periodo_inteiro');
    expect(readWindowOrigin(null)).toBeUndefined();
  });
});

describe('adapter do roadmap (E8): ResultsResponse do Nexus', () => {
  const r = buildResults(snap, nexus, catalog)!;

  it('valida no schema e identifica a fonte', () => {
    expect(resultsResponseSchema.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({ faroId: 'FARO-2026-0001', source: 'roadmap', asOf: '2026-10-12', fetchedAt: meta.fetchedAt, grain: 'user', availableGrains: ['user', 'session'], platforms: ['all', 'android', 'ios'] });
    expect(r.readWindow).toEqual({ start: '2026-08-31', end: '2026-10-12', origin: 'roadmap' });
    expect(r.status).toMatch(/^decidido/);
    expect(r.lineage[0]).toMatchObject({ sqlRef: 'data/models/results/dy_results.sql', sqlVersion: 'v3 (2026-10-11)' });
    expect(r.notes?.some((n) => /D\+5/.test(n))).toBe(true);
  });

  it('variantes com controle primeiro, split do cadastro e share observado', () => {
    expect(r.variants).toEqual([
      { key: 'home_antiga', name: 'home antiga', isControl: true, plannedShare: 0.02, observedShare: 0.0191 },
      { key: 'home_nova', name: 'home nova', isControl: false, plannedShare: 0.98, observedShare: 0.9809 },
    ]);
    expect(r.volumes).toEqual([
      { platform: 'all', variantKey: 'home_antiga', users: 21379, buyers: 1596, transactions: 1995, revenue: 467283 },
      { platform: 'all', variantKey: 'home_nova', users: 1100094, buyers: 280454, transactions: 464349, revenue: 97333314 },
    ]);
  });

  it('métricas: valor do controle, estatísticas prontas do SQL e rótulo pela regra do Faro', () => {
    const c = by(r, 'receita_por_usuario', 'home_antiga');
    const v = by(r, 'receita_por_usuario', 'home_nova');
    expect(c).toMatchObject({ value: 21.83, n: 21379 });
    expect(c.deltaRelative).toBeUndefined();
    expect(v).toMatchObject({ value: 88.2, n: 1100094, deltaRelative: 1.081, probBetter: 1, label: 'melhora_confirmada', mde: 0.045, role: 'norte', confirmed: true, cuped: true, minEvents: 30 });
    expect(v.ci95).toEqual({ lower: 1.031, upper: 1.131 });
    expect(v.bayes).toMatchObject({ probBetter: 1, recommendation: 'Ligar variante', lossSwitch: 0.001, lossKeep: 0.5 });
    expect(by(r, 'ticket_medio', 'home_nova')).toMatchObject({ label: 'queda_confirmada', role: 'exploratoria', cuped: false });
    expect(by(r, 'conversao', 'home_nova').role).toBe('guarda');
    // margem2_por_unidade do SQL → margem_2_por_usuario do catálogo do Faro
    expect(by(r, 'margem_2_por_usuario', 'home_nova').value).toBe(13.08);
    // p_vence 0,19: pela regra do Faro é tendência de queda (o visualizador dizia "sem tendência"); a tela fica igual entre fontes.
    expect(by(r, 'churn_clube', 'home_nova').label).toBe('tendencia_de_queda');
    expect(by(r, 'conversao_saude', 'home_nova').label).toBe('tendencia_de_queda');
    // ticket_saude só tem valor na variante: linha do controle com value null; vidas sem coluna: ausente
    expect(by(r, 'ticket_saude', 'home_antiga').value).toBeNull();
    expect(r.results.some((x) => x.metricId === 'vidas_por_usuario')).toBe(false);
    expect(r.notes?.some((n) => n.includes('secundaria'))).toBe(true);
  });

  it('SRM com p do SQL, dias instáveis do daily e contaminação', () => {
    expect(r.srm).toMatchObject({ pValue: 1, alert: false, plannedShares: [0.02, 0.98], degreesOfFreedom: 1, unstableSplitDays: 2 });
    expect(r.srm.observedShares[0]).toBeCloseTo(0.0191, 3);
    expect(r.srm.chiSquare).toBeGreaterThan(0);
    expect(r.contamination.users).toBe(26016);
    expect(r.contamination.share).toBeCloseTo(26016 / (21379 + 1100094 + 26016), 6);
  });

  it('MDE da variante com o MDE do design na NORTE', () => {
    expect(r.mde.find((m) => m.metricId === 'receita_por_usuario')).toEqual({ metricId: 'receita_por_usuario', mdeCurrent: 0.045, mdeDesign: nexus.design.mdeRelative });
    expect(r.mde.find((m) => m.metricId === 'conversao')).toEqual({ metricId: 'conversao', mdeCurrent: 0.068 });
  });

  it('recomendação traduzida do SQL e síntese pelo motor', () => {
    expect(r.recommendation.code).toBe('implementar');
    expect(r.recommendation.title).toBe('Implementar a variante e desligar a campanha no DY');
    expect(r.recommendation.body).toContain('Receita por usuário');
    expect(r.recommendation.body).toContain('Roadmap: “Ligar variante”');
    expect(r.synthesis?.text).toContain('home nova (consolidado): métrica principal receita por usuário +108,1% (melhora confirmada, 100%)');
    expect(r.synthesis?.parts[0]).toMatchObject({ metricId: 'receita_por_usuario', role: 'norte' });
    expect(r.synthesis?.parts).toHaveLength(4);
  });

  it('funil derivado das taxas bate com a fixture do Nexus', () => {
    const u = (key: string, step: string) => r.funnel!.rows.find((x) => x.variantKey === key && x.stepId === step)!.users;
    expect(r.funnel!.steps.map((s) => s.stepId)).toEqual(['expostos', 'carrinho', 'compra', 'clube']);
    expect([u('home_antiga', 'expostos'), u('home_antiga', 'carrinho'), u('home_antiga', 'compra'), u('home_antiga', 'clube')]).toEqual([21379, 2166, 1596, 64]);
    expect(u('home_nova', 'carrinho')).toBe(Math.round(1100094 * 0.3062));
  });

  it('saúde do teste: expostos por dia e NORTE acumulada sobre usuarios_leitura', () => {
    const antiga = r.health.filter((h) => h.variantKey === 'home_antiga');
    expect(antiga).toHaveLength(10);
    expect(antiga[0]).toEqual({ date: '2026-08-29', platform: 'all', variantKey: 'home_antiga', exposedUsers: 520, primaryValue: 10500 / 480 });
    expect(antiga[1]!.primaryValue).toBeCloseTo(21000 / (480 + 472), 6);
    expect(r.health.every((h) => h.platform === 'all')).toBe(true);
  });

  it('recortes: Android usa as linhas do device; sessão usa o grão sessao; site não existe para o app', () => {
    const android = buildResults(snap, nexus, catalog, { platform: 'android' })!;
    expect(by(android, 'receita_por_usuario', 'home_nova')).toMatchObject({ platform: 'android', value: 80.23, deltaRelative: 1.383 });
    expect(android.volumes[0]).toMatchObject({ platform: 'android', users: 8415 });
    expect(android.health.length).toBe(4);
    const session = buildResults(snap, nexus, catalog, { grain: 'session' })!;
    expect(session.grain).toBe('session');
    expect(by(session, 'conversao', 'home_antiga').n).toBe(Math.floor(21379 * 2.6));
    expect(session.results.every((x) => x.grain === 'session')).toBe(true);
    const site = buildResults(snap, nexus, catalog, { platform: 'site' })!;
    expect(site.results).toHaveLength(0);
    expect(site.volumes).toHaveLength(0);
    expect(site.variants).toHaveLength(2);
    expect(site.notes?.some((x) => x.includes('não disponível'))).toBe(true);
    expect(resultsResponseSchema.safeParse(site).success).toBe(true);
  });

  it('experimento sem campanha no snapshot não tem leitura', () => {
    expect(buildResults(snap, { ...nexus, name: 'outro', dy: { campaignName: 'não existe', labels: [] } }, catalog)).toBeUndefined();
  });
});

describe('adapter do roadmap (E8): campanhas descobertas e recomendação', () => {
  const [cupom, banner] = discoverExperiments(snap, [nexus]) as [Experiment, Experiment];

  it('campanha web: consolidado e site, guardrails que pioraram e janela detectada', () => {
    const r = buildResults(snap, cupom, catalog)!;
    expect(r.faroId).toBe('FARO-0000-0001');
    expect(r.platforms).toEqual(['all', 'site']);
    expect(r.readWindow.origin).toBe('detectado');
    expect(r.guardrailsWorse).toEqual(['ticket_medio']);
    expect(r.variants.map((v) => v.plannedShare)).toEqual([0.5, 0.5]);
    expect(r.recommendation.code).toBe('manter_rodando');
    const site = buildResults(snap, cupom, catalog, { platform: 'site' })!;
    expect(site.results.length).toBeGreaterThan(0);
    expect(site.results.every((x) => x.platform === 'site')).toBe(true);
    expect(site.health.every((h) => h.platform === 'site')).toBe(true);
    expect(r.funnel!.steps.map((s) => s.stepId)).toEqual(['expostos', 'carrinho', 'compra']);
  });

  it('split desigual no SQL vira investigar_srm e o alerta de SRM acende', () => {
    const r = buildResults(snap, banner, catalog)!;
    expect(r.srm.alert).toBe(true);
    expect(r.recommendation.code).toBe('investigar_srm');
  });

  it('sem texto de recomendação no SQL, cai nas regras do Faro', () => {
    const rows = (read('results.json') as Record<string, unknown>[]).map((x) =>
      x.campanha === 'Cupom de primeira compra no checkout' ? { ...x, recomendacao_conversao: null } : x,
    );
    const s2 = snapshotFromRows({ results: rows, discovery: read('discovery.json'), daily: read('daily.json') }, meta);
    const r = buildResults(s2, cupom, catalog)!;
    expect(r.recommendation.code).toBe('manter_rodando');
    expect(r.recommendation.body).not.toContain('Roadmap:');
  });

  it('tabela de tradução cobre os textos da consulta', () => {
    const cases: [string, string][] = [
      ['Ligar variante', 'implementar'],
      ['Manter controle', 'desligar_variante'],
      ['Continuar coletando', 'manter_rodando'],
      ['Sem diferença relevante', 'encerrar_sem_vencedor'],
      ['Não ligar: piora ticket', 'avaliar_guardrail'],
      ['Aguardar (split desigual)', 'investigar_srm'],
      ['Aguardar (decidido)', 'desligar_campanha'],
      ['Aguardar (volume baixo)', 'manter_ate_amostra'],
      ['Aguardar (menos de 7 dias)', 'manter_ate_amostra'],
      ['Aguardar (poucos eventos)', 'manter_ate_amostra'],
      ['Sem dado', 'aguardando_dados'],
    ];
    for (const [t, code] of cases) expect(recommendationCode(t), t).toBe(code);
    expect(recommendationCode('qualquer outra coisa')).toBeUndefined();
    expect(translateRecommendation(null, 'x')).toBeUndefined();
  });
});

describe('fonte de resultados (E8): seleção e snapshot só de resultados', () => {
  it('FARO_SOURCE inválido ou roadmap sem snapshot falham com mensagem; sem nada, fixtures', () => {
    expect(() => createResultsSource({ source: 'x' })).toThrow('FARO_SOURCE inválido');
    const empty = mkdtempSync(resolve(tmpdir(), 'faro-empty-'));
    expect(() => createResultsSource({ source: 'roadmap', root: empty, resultsFile: resolve(empty, 'nada.json') }).snapshot()).toThrow('não há snapshot');
    const src = createResultsSource({ root: empty, resultsFile: resolve(empty, 'nada.json') });
    expect(src.snapshot()).toBeUndefined();
    expect(src.info()).toEqual({ source: 'fixtures' });
    expect(createResultsSource({ source: 'fixtures', root: tmpSnapshot() }).snapshot()).toBeUndefined();
  });

  it('snapshot completo em data/snapshots/roadmap: cadastro ∪ descobertos', () => {
    const src = createResultsSource({ root: tmpSnapshot() });
    const s = src.snapshot()!;
    expect(src.info()).toMatchObject({ source: 'roadmap', snapshot: meta });
    expect(src.info().snapshot).toMatchObject({ rows: { results: 18, discovery: 3, daily: 28 } });
    expect(s.results).toHaveLength(18);
    expect(discoverExperiments(s, [nexus])).toHaveLength(2);
    src.invalidate();
    expect(src.snapshot()?.meta.dir).toBe('2026-10-12');
  });

  it('saída do job:sync-results (só dy_results) vira snapshot sem discovery nem daily', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'faro-results-'));
    const file = resolve(tmp, 'results.json');
    writeFileSync(file, JSON.stringify({ generatedAt: '2026-10-15T12:00:00.000Z', rows: read('results.json') }));
    const s = loadResultsFileSnapshot(file);
    expect(s.meta).toEqual({ dir: 'services/api/.data/results.json', dadosAte: '2026-10-13', fetchedAt: '2026-10-15T12:00:00.000Z', sqlVersion: 'v3 (2026-10-11)' });
    expect(s.discovery).toEqual([]);
    expect(discoverExperiments(s, [nexus]).map((e) => e.name)).toEqual(['Cupom de primeira compra no checkout', 'Teste Banner Home']);
    const r = buildResults(s, nexus, catalog)!;
    expect(r.source).toBe('roadmap');
    expect(r.health).toEqual([]);
    expect(r.srm.unstableSplitDays).toBe(0);
    expect(r.notes?.some((n) => n.includes('dy_daily'))).toBe(true);
    const src = createResultsSource({ root: tmp, resultsFile: file });
    expect(src.info().source).toBe('roadmap');
  });
});
