import { describe, expect, it } from 'vitest';
import {
  ExperimentAuditEventSchema,
  ExperimentHealthSchema,
  ExperimentSchema,
  MetricResultSchema,
} from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import metricResults from '@faro/contracts/fixtures/metric-results.json';
import auditEvents from '@faro/contracts/fixtures/audit-events.json';
import experimentHealth from '@faro/contracts/fixtures/experiment-health.json';
import {
  buildTimeline,
  contaminationShare,
  describeEvent,
  formatDateTime,
  formatMetricValue,
  formatSplit,
  headerTags,
  norteRows,
} from '.';

const exps = experiments.items.map((e) => ExperimentSchema.parse(e));
const results = metricResults.items.map((r) => MetricResultSchema.parse(r));
const events = auditEvents.items.map((e) => ExperimentAuditEventSchema.parse(e));
const byId = (id: string) => exps.find((e) => e.faroId === id)!;
const healthItems = experimentHealth.items.map((h) => ExperimentHealthSchema.parse(h));
const summaryOf = (id: string) => healthItems.find((s) => s.faroId === id);
const pageName = (id: string) => ({ home: 'Home', carrinho: 'Carrinho' })[id] ?? id;

describe('cabeçalho (PNL-05)', () => {
  const tags = (id: string) => headerTags(byId(id), summaryOf(id), pageName);
  const tag = (id: string, label: string) => tags(id).find((t) => t.label === label);

  it('tem as tags pedidas no spec', () => {
    expect(tags('FARO-2026-0001').map((t) => t.label)).toEqual([
      'Status',
      'BU',
      'Variantes',
      'Onde',
      'Público',
      'Tráfego',
      'Contaminação',
      'Sobreposições',
    ]);
  });

  it('Nexus: split 2% × 98% em alerta, contaminação 26.016 (2,3%), sobreposição alta sem decisão', () => {
    expect(tag('FARO-2026-0001', 'Tráfego')).toMatchObject({
      value: '100% do público · split 2% × 98%',
      tone: 'warn',
    });
    expect(tag('FARO-2026-0001', 'Contaminação')?.value).toBe(
      '26.016 viram mais de uma variante (2,3%), excluídos',
    );
    expect(tag('FARO-2026-0001', 'Sobreposições')).toMatchObject({
      value: '1 · pior alto · 1 sem decisão',
      tone: 'risk',
    });
    expect(tag('FARO-2026-0001', 'Variantes')?.value).toBe('home antiga × home nova');
  });

  it('sem resumo de resultado, não mostra contaminação', () => {
    expect(tag('FARO-2026-0005', 'Contaminação')).toBeUndefined();
  });

  it('sobreposição alta já resolvida não é risco', () => {
    expect(tag('FARO-2026-0008', 'Sobreposições')).toMatchObject({ value: '1 · pior alto', tone: 'warn' });
  });

  it('sem sobreposição', () => {
    expect(tag('FARO-2026-0002', 'Sobreposições')?.value).toBe('nenhuma');
  });
});

describe('resultado', () => {
  it('NORTE do Nexus: consolidado, Android e iOS, com controle e variante', () => {
    const rows = norteRows(byId('FARO-2026-0001'), results);
    expect(rows.map((r) => r.platform)).toEqual(['all', 'android', 'ios']);
    expect(rows[0]!.control?.value).toBe(21.83);
    expect(rows[0]!.variants.map((v) => v.variantKey)).toEqual(['home_nova']);
  });

  it('teste sem leitura não tem linhas', () => {
    expect(norteRows(byId('FARO-2026-0005'), results)).toEqual([]);
  });

  it('contaminação é a fração sobre os usuários expostos', () => {
    expect(contaminationShare(summaryOf('FARO-2026-0001')!)).toBeCloseTo(0.0232, 4);
    expect(contaminationShare({ ...summaryOf('FARO-2026-0001')!, usersByVariant: {} })).toBe(0);
  });

  it.each([
    [0.2549, 'percent', '25,5%'],
    [0.0022, 'percent', '0,22%'],
    [88.2, 'brl', 'R$ 88,20'],
    [1.5, 'seconds', '1,5 s'],
    [null, 'percent', '—'],
  ] as const)('formata %s (%s) como %s', (v, unit, out) => {
    expect(formatMetricValue(v, unit).replace(/\u00a0/g, ' ')).toBe(out);
  });

  it('formata split', () => {
    expect(formatSplit([0.5, 0.5])).toBe('50% × 50%');
    expect(formatSplit([0.02, 0.98])).toBe('2% × 98%');
    expect(formatSplit([0.333, 0.667])).toBe('33,3% × 66,7%');
  });
});

describe('linha do tempo (PNL-11)', () => {
  const nexusTimeline = buildTimeline(events.filter((e) => e.faroId === 'FARO-2026-0001'));

  it('mais recente primeiro; no mesmo instante, último registrado primeiro', () => {
    expect(nexusTimeline.map((t) => t.kind)).toEqual([
      'experiment.status_changed',
      'experiment.decided',
      'experiment.status_changed',
      'experiment.created',
    ]);
    expect(nexusTimeline.at(-1)?.title).toBe('Importado do DY como legado');
  });

  it('descreve cada tipo de evento com autor', () => {
    expect(nexusTimeline[0]).toMatchObject({ title: 'Rodando → Decidido', actor: 'squad-nexus@example.com' });
    expect(nexusTimeline[1]).toMatchObject({ title: 'Decisão: Implementar variante' });
    expect(nexusTimeline[2]).toMatchObject({ actor: 'Faro (automático)', detail: 'exposição no export D-1' });

    const alloc = events.find(
      (e) => e.type === 'experiment.allocation_changed' && e.faroId === 'FARO-2026-0005',
    )!;
    expect(describeEvent(alloc)).toMatchObject({
      title: 'Alocação alterada',
      detail: 'grupo de exclusão mútua',
    });
    const design = events.find(
      (e) => e.type === 'experiment.design_changed' && e.faroId === 'FARO-2026-0010',
    )!;
    expect(describeEvent(design).detail).toBe('variantes, métricas GUARDA');
  });

  it('todo experimento das fixtures tem histórico', () => {
    for (const e of exps)
      expect(buildTimeline(events.filter((x) => x.faroId === e.faroId)).length).toBeGreaterThan(0);
  });

  it('datas no fuso de São Paulo', () => {
    expect(formatDateTime('2026-10-13T16:00:00Z')).toBe('13/10/2026, 13:00');
    expect(formatDateTime('2026-10-13')).toBe('13/10/2026');
  });
});
