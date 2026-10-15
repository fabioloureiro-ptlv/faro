import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  AudienceShortcutSchema,
  DesignSchema,
  ExperimentSchema,
  FaroEventSchema,
  MetricDefinitionSchema,
  MetricResultSchema,
  PageCatalogSchema,
  TemplateSchema,
  type Design,
  type Experiment,
  type MetricDefinition,
  type MetricResult,
} from '../src/index.ts';
import nexus from '../fixtures/nexus.json' with { type: 'json' };
import simulated from '../fixtures/simulated.json' with { type: 'json' };
import metrics from '../fixtures/metrics-catalog.json' with { type: 'json' };
import pages from '../fixtures/pages.json' with { type: 'json' };
import audiences from '../fixtures/audiences.json' with { type: 'json' };
import templates from '../fixtures/templates.json' with { type: 'json' };

describe('tipos inferidos dos schemas espelham as interfaces da seção 6', () => {
  it('Experiment, Design, MetricDefinition e MetricResult', () => {
    expectTypeOf<z.infer<typeof ExperimentSchema>>().toEqualTypeOf<Experiment>();
    expectTypeOf<z.infer<typeof DesignSchema>>().toEqualTypeOf<Design>();
    expectTypeOf<z.infer<typeof MetricDefinitionSchema>>().toEqualTypeOf<MetricDefinition>();
    expectTypeOf<z.infer<typeof MetricResultSchema>>().toEqualTypeOf<MetricResult>();
  });
});

describe('fixtures obrigatórias validam nos schemas', () => {
  it('Nexus: experimento legado, resultados e export', () => {
    const exp = ExperimentSchema.parse(nexus.experiment);
    expect(exp.legacy).toBe(true);
    expect(exp.allocation.split).toEqual([0.02, 0.98]);
    expect(exp.design.primaryMetricId).toBe('receita_por_usuario');
    expect(nexus.health.contaminatedUsers).toBe(26016);
    expect(nexus.health.unstableSplitDays).toBe(6);
    for (const r of nexus.results) MetricResultSchema.parse(r);
    expect(nexus.results.some((r) => r.platform === 'ios')).toBe(true);
  });

  it('testes simulados cobrem os 5 cenários de borda', () => {
    for (const e of simulated.experiments) ExperimentSchema.parse(e);
    for (const r of simulated.results) MetricResultSchema.parse(r);
    const scenarios = simulated.experiments.map((e) => (e as { scenario?: string }).scenario).filter(Boolean);
    expect(scenarios.sort()).toEqual([
      'agendado_sem_dados',
      'encerrado_com_vencedor',
      'melhora_confirmada_amostra_incompleta',
      'srm',
      'tendencia_sem_significancia',
    ]);
  });

  it('catálogo de métricas, páginas, públicos e templates', () => {
    for (const m of metrics) MetricDefinitionSchema.parse(m);
    PageCatalogSchema.parse(pages);
    for (const a of audiences) AudienceShortcutSchema.parse(a);
    for (const t of templates) TemplateSchema.parse(t);
  });

  it('toda métrica referenciada por fixtures existe no catálogo', () => {
    const ids = new Set(metrics.map((m) => m.id));
    const exps = [nexus.experiment, ...simulated.experiments];
    for (const e of exps)
      for (const id of [e.design.primaryMetricId, ...e.design.secondaryMetricIds, ...e.design.guardrailMetricIds])
        expect(ids.has(id), `${e.faroId}: ${id}`).toBe(true);
    for (const t of templates)
      for (const id of [t.design.primaryMetricId!, ...t.design.secondaryMetricIds!]) expect(ids.has(id)).toBe(true);
  });

  it('fixtures sem dado pessoal: só e-mails @example.com', () => {
    const text = JSON.stringify([nexus, simulated, templates]);
    const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    for (const e of emails) expect(e.endsWith('@example.com'), e).toBe(true);
  });
});

describe('regras de forma', () => {
  it('faroId rejeita formato inválido', () => {
    const bad = { ...nexus.experiment, faroId: 'FARO-26-1' };
    expect(ExperimentSchema.safeParse(bad).success).toBe(false);
  });

  it('round-trip JSON preserva o experimento', () => {
    const exp = ExperimentSchema.parse(nexus.experiment);
    expect(ExperimentSchema.parse(JSON.parse(JSON.stringify(exp)))).toEqual(exp);
  });

  it('eventos: união discriminada valida cada tipo', () => {
    const base = { faroId: 'FARO-2026-0042', occurredAt: '2026-10-14T10:00:00-03:00', actor: 'pm@example.com' };
    expect(FaroEventSchema.parse({ type: 'experiment.created', ...base, payload: { name: 'x', legacy: false } }).type).toBe('experiment.created');
    expect(
      FaroEventSchema.safeParse({ type: 'experiment.config_divergence', ...base, payload: { divergences: [] } }).success,
    ).toBe(false);
  });
});
