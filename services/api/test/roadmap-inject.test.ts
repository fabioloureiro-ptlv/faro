import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Experiment } from '@faro/contracts';
import nexusFixture from '@faro/contracts/fixtures/nexus.json' with { type: 'json' };
import { buildQueries, injectMarkers, markerRowsFromExperiments, markersIn, setCampanhaAlvo } from '../src/resultados/roadmap/inject.ts';
import { MARKER_KEYS, markerPattern, sqlString } from '../src/resultados/roadmap/markers.ts';

const templateMin = readFileSync(new URL('./fixtures/roadmap/template-min.sql', import.meta.url), 'utf8');
const realResults = readFileSync(fileURLToPath(new URL('../../../data/models/results/dy_results.sql', import.meta.url)), 'utf8');

const nexus: Experiment = {
  ...(nexusFixture.experiment as unknown as Experiment),
  allocation: { ...(nexusFixture.experiment.allocation as Experiment['allocation']), readWindow: { start: '2026-08-31', end: '2026-10-12' } },
};
const base = { ownerEmail: 'faro@example.com', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', ownerSquad: 'x', audience: { description: 'Todos', source: 'atalho' as const } };
const design = (control: string, variants: string[], primary: string): Experiment['design'] => ({
  context: '',
  hypothesis: { change: '', expectedEffect: '', because: '' },
  control: { name: control, description: '' },
  variants: variants.map((n, i) => ({ key: `v${i}`, name: n, description: '' })),
  primaryMetricId: primary,
  secondaryMetricIds: [],
  guardrailMetricIds: [],
  mdeRelative: 0.05,
});
const cupom: Experiment = {
  ...base,
  faroId: 'FARO-2026-0101',
  name: "Cupom d'ouro",
  bu: 'ecom',
  status: 'rodando',
  design: design('Controle', ['Variante A', 'Variante B'], 'conversao'),
  allocation: { platforms: ['site'], pages: ['checkout'], trafficPercent: 50, split: [0.34, 0.33, 0.33], startDate: '2026-10-02', endDate: '2026-10-30' },
  dy: { campaignName: "Cupom d'ouro | checkout", labels: [] },
};
const semDy: Experiment = { ...cupom, faroId: 'FARO-2026-0105', dy: undefined };

describe('injetor de marcadores (E8)', () => {
  it('gera as linhas do cadastro e ignora experimento sem campanha no DY', () => {
    const rows = markerRowsFromExperiments([nexus, cupom, semDy]);
    expect(rows.linked.map((r) => r.campanha)).toEqual(['Nexus | Nova Home do App', "Cupom d'ouro | checkout"]);
    expect(rows.overrides[0]).toEqual({ campanha: 'Nexus | Nova Home do App', dataInicio: '2026-08-31', dataFim: '2026-10-12', controle: 'home antiga' });
    expect(rows.overrides[1]).toMatchObject({ dataInicio: null, dataFim: null, controle: 'Controle' });
    expect(rows.split.filter((r) => r.campanha.startsWith('Cupom')).map((r) => [r.variacao, r.share])).toEqual([
      ['Controle', 0.34],
      ['Variante A', 0.33],
      ['Variante B', 0.33],
    ]);
    expect(rows.norte).toEqual([
      { campanha: 'Nexus | Nova Home do App', metrica: 'receita_por_unidade' },
      { campanha: "Cupom d'ouro | checkout", metrica: 'conversao' },
    ]);
    expect(rows.warnings).toEqual([]);
  });

  it('NORTE sem equivalente no SQL é omitida com aviso; split errado cai em 1/n', () => {
    const e: Experiment = { ...cupom, design: design('Controle', ['A'], 'cliques_recomendacao'), allocation: { ...cupom.allocation, split: [1] } };
    const rows = markerRowsFromExperiments([e]);
    expect(rows.norte).toEqual([]);
    expect(rows.split.map((r) => r.share)).toEqual([0.5, 0.5]);
    expect(rows.warnings).toHaveLength(2);
  });

  it('template mínimo: substitui a linha de cada marcador mantendo a indentação, com vírgula à frente e escape de aspas', () => {
    const sql = injectMarkers(templateMin, markerRowsFromExperiments([nexus, cupom]));
    expect(sql).not.toMatch(/-- \{(overrides|linked|split|norte)\}/);
    expect(sql).toContain(
      "    , STRUCT('Nexus | Nova Home do App', DATE '2026-08-31', DATE '2026-10-12', 'home antiga')\n    , STRUCT('Cupom d\\'ouro | checkout', CAST(NULL AS DATE), CAST(NULL AS DATE), 'Controle')\n  ])",
    );
    expect(sql).toContain("    , 'Nexus | Nova Home do App'\n    , 'Cupom d\\'ouro | checkout'\n  ])");
    expect(sql).toContain(", STRUCT('Nexus | Nova Home do App', 'home nova', 0.98)");
    expect(sql).toContain(", STRUCT('Cupom d\\'ouro | checkout', 'conversao')\n  ])");
  });

  it('sem cadastro, o marcador vira um comentário (a linha tipada do UNNEST mantém a consulta válida)', () => {
    const sql = injectMarkers(templateMin, markerRowsFromExperiments([]));
    expect(sql).not.toMatch(/-- \{(overrides|linked|split|norte)\}/);
    expect(sql.match(/-- cadastro do Faro: nenhum experimento/g)).toHaveLength(4);
  });

  it('consulta real (data/models/results/dy_results.sql): troca os marcadores e descarta o cadastro do roadmap', () => {
    expect(markersIn(realResults)).toEqual([...MARKER_KEYS]);
    expect(realResults).toContain("    , STRUCT('FIDE | Android | Modal Upsize Embalagem', DATE '2026-09-22', DATE '2026-10-08', CAST(NULL AS STRING))");
    const sql = injectMarkers(realResults, markerRowsFromExperiments([nexus]));
    for (const k of MARKER_KEYS) expect(markerPattern(k).test(sql), k).toBe(false);
    expect(sql).not.toContain('FIDE | Android | Modal Upsize Embalagem');
    expect(sql).not.toContain('AQSI | Clube Anual Grátis');
    // overrides: linha tipada + cadastro do Faro + fechamento do UNNEST
    expect(sql).toContain(
      "  STRUCT('' AS campanha, CAST(NULL AS DATE) AS data_inicio, CAST(NULL AS DATE) AS data_fim, CAST(NULL AS STRING) AS controle)\n    , STRUCT('Nexus | Nova Home do App', DATE '2026-08-31', DATE '2026-10-12', 'home antiga')\n]) WHERE campanha <> '';",
    );
    expect(sql).toContain("  ''\n    , 'Nexus | Nova Home do App'\n]) AS campanha WHERE campanha <> '';");
    expect(sql).toContain("  STRUCT('' AS campanha, '' AS variacao, CAST(NULL AS FLOAT64) AS share)\n    , STRUCT('Nexus | Nova Home do App', 'home antiga', 0.02)\n    , STRUCT('Nexus | Nova Home do App', 'home nova', 0.98)\n]) WHERE campanha <> '';");
    expect(sql).toContain("  STRUCT('' AS campanha, '' AS metrica)\n    , STRUCT('Nexus | Nova Home do App', 'receita_por_unidade')\n]) WHERE campanha <> '';");
    // nada além dos blocos cfg_* muda
    expect(sql.split('\n').length).toBeLessThan(realResults.split('\n').length);
    expect(sql.slice(sql.indexOf('CREATE TEMP TABLE cfg_norte'))).toContain('ORDER BY r.campanha, r.grao');
  });

  it('--campanha substitui o DECLARE existente ou acrescenta no topo', () => {
    expect(setCampanhaAlvo(realResults, 'Nexus | Nova Home do App')).toContain("DECLARE campanha_alvo STRING DEFAULT 'Nexus | Nova Home do App';");
    expect(setCampanhaAlvo(realResults, 'x')).not.toContain('campanha_alvo STRING DEFAULT NULL');
    expect(setCampanhaAlvo('SELECT 1', "a'b").startsWith("DECLARE campanha_alvo STRING DEFAULT 'a\\'b';\nSELECT 1")).toBe(true);
    expect(setCampanhaAlvo(templateMin, undefined)).toBe(templateMin);
  });

  it('buildQueries avisa marcador que não aparece em nenhuma consulta', () => {
    const q = buildQueries({ results: realResults, discovery: 'SELECT 1', daily: 'SELECT 2' }, [nexus]);
    expect(q.results).toContain("'home antiga')");
    expect(q.warnings).toEqual([]);
    const q2 = buildQueries({ results: 'SELECT 1', discovery: 'SELECT 1', daily: 'SELECT 2' }, [nexus]);
    expect(q2.warnings.some((w) => w.includes('{norte}'))).toBe(true);
  });

  it('sqlString escapa barra, aspas e quebra de linha', () => {
    expect(sqlString("a\\b 'c'\nd")).toBe("'a\\\\b \\'c\\' d'");
  });
});
