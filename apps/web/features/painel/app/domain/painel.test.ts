import { describe, expect, it } from 'vitest';
import {
  DyCampaignStatusSchema,
  ExperimentHealthSchema,
  ExperimentSchema,
  MetricResultSchema,
} from '@faro/contracts';
import type { Experiment } from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import metricResults from '@faro/contracts/fixtures/metric-results.json';
import dyCampaigns from '@faro/contracts/fixtures/dy-campaigns.json';
import experimentHealth from '@faro/contracts/fixtures/experiment-health.json';
import { evaluateGovernance } from '@faro/api/experiments/governance';
import {
  DEFAULT_FILTERS,
  applyFilters,
  buildRows,
  filtersToQuery,
  matchesSearch,
  parseFilters,
  sortRows,
  type PainelFilters,
  type PainelRow,
} from '.';

const exps = experiments.items.map((e) => ExperimentSchema.parse(e));
const norteResults = metricResults.items.map((r) => MetricResultSchema.parse(r));
const alerts = evaluateGovernance({
  experiments: exps,
  campaigns: dyCampaigns.items.map((c) => DyCampaignStatusSchema.parse(c)),
  norteResults,
  health: experimentHealth.items.map((h) => ExperimentHealthSchema.parse(h)),
  today: '2026-10-14',
  experimentationTeam: 'time-experimentacao@example.com',
});
const rows = buildRows({ experiments: exps, norteResults, alerts });
const f = (over: Partial<PainelFilters> = {}): PainelFilters => ({ ...DEFAULT_FILTERS, ...over });
const ids = (rs: PainelRow[]) => rs.map((r) => r.experiment.faroId);

describe('buildRows', () => {
  it('liga NORTE da variante (não do controle) e alertas abertos com faroId', () => {
    const nexus = rows.find((r) => r.experiment.faroId === 'FARO-2026-0001')!;
    expect(nexus.norte).toMatchObject({
      variantKey: 'home_nova',
      platform: 'all',
      label: 'melhora_confirmada',
    });
    // design_incompleto, decidido_ativo, split_extremo, srm e conflito_sem_resolucao (motor de governança)
    expect(nexus.alerts).toHaveLength(5);
    const agendado = rows.find((r) => r.experiment.faroId === 'FARO-2026-0005')!;
    expect(agendado.norte).toBeUndefined();
  });

  it('ignora alertas resolvidos', () => {
    const r = buildRows({
      experiments: exps.slice(0, 1),
      norteResults: [],
      alerts: [{ ...alerts.find((a) => a.faroId === exps[0]!.faroId)!, resolvedAt: '2026-10-14' }],
    });
    expect(r[0]!.alerts).toEqual([]);
  });
});

describe('filtro de BU', () => {
  it('Ecossistema (todas) mostra tudo', () => {
    expect(applyFilters(rows, f())).toHaveLength(exps.length);
  });

  it('Saúde mostra os testes de Saúde e os de ecossistema', () => {
    const r = applyFilters(rows, f({ bu: 'saude' }));
    expect(new Set(r.map((x) => x.experiment.bu))).toEqual(new Set(['saude', 'ecossistema']));
    expect(ids(r)).toContain('FARO-2026-0001');
    expect(ids(r)).toContain('FARO-2026-0004');
  });

  it('cada BU inclui o Nexus (ecossistema) e exclui as outras BUs', () => {
    for (const bu of ['ecom', 'saude', 'fintech', 'servicos'] as const) {
      const r = applyFilters(rows, f({ bu }));
      expect(ids(r)).toContain('FARO-2026-0001');
      expect(r.every((x) => x.experiment.bu === bu || x.experiment.bu === 'ecossistema')).toBe(true);
    }
  });
});

describe('demais filtros', () => {
  it('status (multi)', () => {
    const r = applyFilters(rows, f({ status: ['rodando', 'decidido'] }));
    expect(r.every((x) => ['rodando', 'decidido'].includes(x.experiment.status))).toBe(true);
    expect(r).toHaveLength(5);
  });

  it('squad', () => {
    expect(ids(applyFilters(rows, f({ squad: ['Squad Fintech'] })))).toEqual([
      'FARO-2026-0007',
      'FARO-2026-0011',
    ]);
  });

  it('plataforma: qualquer uma das selecionadas', () => {
    const r = applyFilters(rows, f({ platform: ['site'] }));
    expect(r.every((x) => x.experiment.allocation.platforms.includes('site'))).toBe(true);
    expect(ids(r)).not.toContain('FARO-2026-0001');
  });

  it('página', () => {
    const r = applyFilters(rows, f({ page: ['home'] }));
    expect(ids(r).sort()).toEqual(['FARO-2026-0001', 'FARO-2026-0004', 'FARO-2026-0005', 'FARO-2026-0008']);
  });

  it('período: janela que cruza o intervalo', () => {
    const r = applyFilters(rows, f({ from: '2026-11-01', to: '2026-11-30' }));
    expect(ids(r)).not.toContain('FARO-2026-0006'); // set/2026
    expect(ids(r)).toContain('FARO-2026-0001'); // vai até 30/11
    expect(ids(r)).toContain('FARO-2026-0010'); // começa 10/11
  });

  it('tem alerta', () => {
    expect(ids(applyFilters(rows, f({ hasAlert: true }))).sort()).toEqual([
      'FARO-2026-0001',
      'FARO-2026-0002',
      'FARO-2026-0004',
    ]);
  });

  it('legado sem design', () => {
    expect(ids(applyFilters(rows, f({ legacy: true })))).toEqual(['FARO-2026-0001']);
  });

  it('filtros combinam com E', () => {
    expect(ids(applyFilters(rows, f({ bu: 'saude', hasAlert: true, platform: ['ios'] })))).toEqual([
      'FARO-2026-0004',
      'FARO-2026-0001',
    ]);
  });
});

describe('busca (PNL-03)', () => {
  const by = (q: string) => ids(applyFilters(rows, f({ q })));

  it('por nome, sem acento e sem caixa', () => expect(by('AREA SAUDE')).toEqual(['FARO-2026-0004']));
  it('por faroId', () => expect(by('faro-2026-0007')).toEqual(['FARO-2026-0007']));
  it('por nome da campanha no DY', () => {
    const legacy: Experiment = {
      ...exps[0]!,
      faroId: 'FARO-2026-0099',
      name: 'X',
      dy: { ...exps[0]!.dy!, campaignName: 'Campanha Zeta', labels: ['faro:FARO-2026-0099'] },
    };
    expect(matchesSearch(legacy, 'zeta')).toBe(true);
  });
  it('por texto do design (hipótese/contexto)', () =>
    expect(by('41% dos clientes')).toEqual(['FARO-2026-0002']));
  it('vários termos são AND', () => {
    expect(by('cashback pagamento')).toEqual(['FARO-2026-0007']);
    expect(by('cashback carrinho')).toEqual([]);
  });
});

describe('ordenação (PNL-01: qualquer coluna)', () => {
  it('status segue o ciclo de vida', () => {
    const r = sortRows(rows, 'status', 'asc').map((x) => x.experiment.status);
    expect(r[0]).toBe('rascunho');
    expect(r.at(-1)).toBe('cancelado');
  });

  it('NORTE: maior chance primeiro em desc, sem leitura sempre no fim', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const r = sortRows(rows, 'norte', dir);
      const firstMissing = r.findIndex((x) => !x.norte);
      expect(r.slice(firstMissing).every((x) => !x.norte)).toBe(true);
    }
    expect(sortRows(rows, 'norte', 'desc')[0]!.experiment.faroId).toBe('FARO-2026-0001');
  });

  it('alertas: crítico antes de atenção em desc', () => {
    const r = sortRows(rows, 'alertas', 'desc');
    expect(ids(r).slice(0, 3)).toEqual(['FARO-2026-0001', 'FARO-2026-0004', 'FARO-2026-0002']);
  });

  it('sobreposição: alto sem resolução e com resolução antes de médio', () => {
    const r = sortRows(rows, 'sobreposicao', 'desc');
    expect(r[0]!.experiment.overlap?.some((o) => o.severity === 'alto')).toBe(true);
  });

  it.each(['nome', 'onde', 'publico', 'periodo'] as const)('%s asc é o inverso de desc (estável)', (key) => {
    const asc = ids(sortRows(rows, key, 'asc'));
    const desc = ids(sortRows(rows, key, 'desc'));
    expect(asc).toHaveLength(desc.length);
    expect(new Set(asc)).toEqual(new Set(desc));
  });

  it('não muta a entrada', () => {
    const before = ids(rows);
    sortRows(rows, 'nome', 'desc');
    expect(ids(rows)).toEqual(before);
  });
});

describe('URL', () => {
  it('ida e volta preserva os filtros', () => {
    const filters = f({
      bu: 'saude',
      status: ['rodando'],
      platform: ['ios', 'android'],
      page: ['home'],
      from: '2026-10-01',
      to: '2026-10-31',
      hasAlert: true,
      legacy: true,
      q: 'home',
      sort: 'norte',
      dir: 'desc',
    });
    expect(parseFilters(filtersToQuery(filters))).toEqual(filters);
  });

  it('filtros padrão geram query vazia', () => expect(filtersToQuery(f())).toEqual({}));

  it('valores inválidos são descartados, nunca lança', () => {
    const r = parseFilters({
      bu: 'marketing',
      status: 'rodando,qualquer',
      plataforma: ['web', 'ios'],
      de: '14/10/2026',
      sort: 'drop table',
      dir: 'sideways',
      alerta: 'true',
      q: 'x'.repeat(500),
    });
    expect(r).toMatchObject({
      bu: 'todas',
      status: ['rodando'],
      platform: ['ios'],
      sort: 'status',
      dir: 'asc',
      hasAlert: false,
    });
    expect(r.from).toBeUndefined();
    expect(r.q).toHaveLength(120);
  });
});

it('200 experimentos: filtrar + buscar + ordenar em < 50 ms (orçamento de 2 s da lista)', () => {
  const many: PainelRow[] = Array.from({ length: 200 }, (_, i) => {
    const base = rows[i % rows.length]!;
    return { ...base, experiment: { ...base.experiment, faroId: `FARO-2026-${String(1000 + i)}` } };
  });
  const t0 = performance.now();
  for (const sort of ['nome', 'norte', 'alertas'] as const) {
    applyFilters(many, f({ bu: 'ecom', q: 'carrinho', sort, dir: 'desc' }));
  }
  expect(performance.now() - t0).toBeLessThan(50);
});
