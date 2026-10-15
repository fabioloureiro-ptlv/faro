// Os números-chave precisam vir do mesmo lugar que o roadmap do Digital (roadmap.petlove.cloud/r/digital/testes):
// as consultas BigQuery versionadas em data/models/results e data/queries/roadmap, lidas pela fonte E8.
// Este teste monta o ResultsResponse pelo adapter da fonte roadmap (fixture sintética das três consultas,
// services/api/test/fixtures/roadmap) e confere que os tiles saem preenchidos a partir dele.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ExperimentSchema,
  MetricDefinitionSchema,
  type Experiment,
  type MetricDefinition,
} from '@faro/contracts';
import metricsCatalog from '@faro/contracts/fixtures/metrics-catalog.json';
import nexusFixture from '@faro/contracts/fixtures/nexus.json';
import { buildResults, snapshotFromRows } from '@faro/api/resultados/roadmap';
import { buildBigNumbers, hasData, type BigNumber } from '.';

const fx = new URL('../../../../../../services/api/test/fixtures/roadmap/', import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, fx), 'utf8')) as unknown;
const meta = {
  dir: '2026-10-12',
  dadosAte: '2026-10-12',
  fetchedAt: '2026-10-15T18:00:00.000Z',
  sqlVersion: 'v3 (2026-10-11)',
};
const snap = snapshotFromRows(
  { results: read('results.json'), discovery: read('discovery.json'), daily: read('daily.json') },
  meta,
);
const catalog: MetricDefinition[] = (metricsCatalog as unknown[]).map((m) =>
  MetricDefinitionSchema.parse(m),
);
const nexus = ExperimentSchema.parse(nexusFixture.experiment) as Experiment;
const norte = catalog.find((m) => m.id === nexus.design.primaryMetricId);
const byId = (tiles: BigNumber[], id: BigNumber['id']) => tiles.find((t) => t.id === id)!;
const text = (t: BigNumber) =>
  t.detail
    .map((line) => line.map((s) => s.text).join(''))
    .join(' | ')
    .replace(/\xa0/g, ' ');

describe('números-chave sobre a fonte roadmap (E8)', () => {
  const r = buildResults(snap, nexus, catalog)!;
  const tiles = buildBigNumbers({
    results: r,
    primaryMetricId: nexus.design.primaryMetricId,
    norte,
  });

  it('a resposta vem das consultas do roadmap e tem leitura', () => {
    expect(r.source).toBe('roadmap');
    expect(r.lineage[0]?.sqlRef).toBe('data/models/results/dy_results.sql');
    expect(hasData(r)).toBe(true);
  });

  it('os quatro tiles saem preenchidos (sem Amostra: o SQL do roadmap não calcula progresso)', () => {
    expect(tiles.map((t) => t.id)).toEqual(['norte', 'expostos', 'periodo', 'split']);
    const hero = byId(tiles, 'norte');
    expect(hero.label).toBe('NORTE · Receita por usuário');
    expect(hero.value).toMatch(/^[+−]\d/);
    expect(hero.badge).toBeDefined();
    expect(text(hero)).toMatch(
      /home nova R\$ .* vs home antiga R\$ .* · chance de ser melhor \d+%/,
    );

    const expostos = byId(tiles, 'expostos');
    expect(expostos.value).not.toBe('0');
    expect(text(expostos)).toMatch(
      /home antiga .* · home nova .* \| .*(viram 2 variantes|sem contaminação)/,
    );

    expect(byId(tiles, 'periodo').value).toMatch(/^\d+ dias$/);
    expect(text(byId(tiles, 'periodo'))).toMatch(/^31\/08 a 12\/10/);

    const split = byId(tiles, 'split');
    expect(split.value).toMatch(/^\d+,\d% \/ \d+,\d%$/);
    expect(split.badge?.text).toBe(r.srm.alert ? 'SRM' : 'ok');
  });

  it('recorte por plataforma e grão da mesma fonte', () => {
    const android = buildResults(snap, nexus, catalog, { platform: 'android' })!;
    const t = buildBigNumbers({
      results: android,
      primaryMetricId: nexus.design.primaryMetricId,
      norte,
    });
    expect(byId(t, 'expostos').value).not.toBe(byId(tiles, 'expostos').value);
    const session = buildResults(snap, nexus, catalog, { grain: 'session' })!;
    expect(
      byId(
        buildBigNumbers({ results: session, primaryMetricId: nexus.design.primaryMetricId, norte }),
        'expostos',
      ).label,
    ).toBe('Expostos (sessões)');
  });
});
