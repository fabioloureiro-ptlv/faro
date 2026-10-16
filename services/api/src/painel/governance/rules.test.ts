import { describe, expect, it } from 'vitest';
import {
  DyCampaignStatusSchema,
  ExperimentHealthSchema,
  ExperimentSchema,
  GovernanceAlertSchema,
  MetricResultSchema,
} from '@faro/contracts';
import type { DyCampaignStatus, Experiment, ExperimentHealth, MetricResult } from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import campaigns from '@faro/contracts/fixtures/dy-campaigns.json';
import results from '@faro/contracts/fixtures/metric-results.json';
import health from '@faro/contracts/fixtures/experiment-health.json';
import { RULES, evaluateGovernance, orphanAlerts, type GovernanceInput, type RuleContext } from './rules.ts';

const exps = experiments.items.map((e) => ExperimentSchema.parse(e));
const camps = campaigns.items.map((c) => DyCampaignStatusSchema.parse(c));
const norte = results.items.map((r) => MetricResultSchema.parse(r));
const healths = health.items.map((h) => ExperimentHealthSchema.parse(h));
const byId = (id: string) => exps.find((e) => e.faroId === id)!;

const TODAY = '2026-10-14';
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({ today: TODAY, divergences: [], ...over });
const campaign = (over: Partial<DyCampaignStatus> = {}): DyCampaignStatus => ({
  campaignId: 'dy-x',
  campaignName: 'x',
  labels: [],
  active: true,
  lastExposureDate: null,
  asOf: '2026-10-13',
  ...over,
});
const healthOf = (id: string) => healths.find((h) => h.faroId === id)!;
const norteOf = (id: string) =>
  norte.find((r) => r.faroId === id && r.variantKey !== 'controle' && r.platform === 'all')!;

const frete = byId('FARO-2026-0002'); // ecom, rodando, design completo
const with_ = (e: Experiment, over: Partial<Experiment>): Experiment => ({ ...e, ...over });

describe('design_incompleto', () => {
  it('positivo: legado com campos vazios', () => {
    expect(RULES.design_incompleto(byId('FARO-2026-0001'), ctx())).toMatchObject({
      severity: 'atencao',
      message:
        'Teste legado importado do DY. Falta registrar: porquê, descrição do controle, descrição das variantes.',
    });
  });
  it('negativo: design completo', () => expect(RULES.design_incompleto(frete, ctx())).toBeNull());
  it('negativo: rascunho ainda em escrita', () =>
    expect(RULES.design_incompleto(byId('FARO-2026-0009'), ctx())).toBeNull());
});

describe('decidido_ativo', () => {
  const nexus = byId('FARO-2026-0001'); // decidido em 13/10
  it('positivo: decidido com campanha ativa → atenção nos primeiros 7 dias', () => {
    expect(RULES.decidido_ativo(nexus, ctx({ campaign: campaign() }))).toMatchObject({ severity: 'atencao' });
  });
  it('positivo: mais de 7 dias → crítico', () => {
    expect(RULES.decidido_ativo(nexus, ctx({ campaign: campaign(), today: '2026-10-21' }))).toMatchObject({
      severity: 'critico',
    });
  });
  it('positivo: encerrado com campanha ativa → crítico', () => {
    expect(RULES.decidido_ativo(byId('FARO-2026-0006'), ctx({ campaign: campaign() }))?.severity).toBe(
      'critico',
    );
  });
  it('negativo: campanha desligada', () => {
    expect(RULES.decidido_ativo(nexus, ctx({ campaign: campaign({ active: false }) }))).toBeNull();
  });
  it('negativo: ainda rodando', () =>
    expect(RULES.decidido_ativo(frete, ctx({ campaign: campaign() }))).toBeNull());
});

describe('split_extremo', () => {
  it('positivo: 2% × 98%', () => {
    expect(RULES.split_extremo(byId('FARO-2026-0001'), ctx())?.message).toContain('98%');
  });
  it('negativo: 50% × 50%', () => expect(RULES.split_extremo(frete, ctx())).toBeNull());
  it('negativo: ainda não configurado no DY', () => {
    const e = with_(frete, {
      status: 'pronto_para_configurar',
      allocation: { ...frete.allocation, split: [0.02, 0.98] },
    });
    expect(RULES.split_extremo(e, ctx())).toBeNull();
  });
});

describe('srm', () => {
  const saude = byId('FARO-2026-0004');
  it('positivo: p < 0,001', () => {
    expect(RULES.srm(saude, ctx({ health: healthOf(saude.faroId) }))).toMatchObject({
      severity: 'critico',
      message: 'Divisão observada 51,4% × 48,6% para 50% × 50% esperado (p < 0,001).',
    });
  });
  it('negativo: p acima do limiar', () =>
    expect(RULES.srm(frete, ctx({ health: healthOf(frete.faroId) }))).toBeNull());
  it('negativo: sem indicador da frente 4', () => expect(RULES.srm(saude, ctx())).toBeNull());
});

describe('parada_antecipada', () => {
  it('positivo: melhora confirmada com 57% da amostra', () => {
    expect(
      RULES.parada_antecipada(frete, ctx({ norte: norteOf(frete.faroId), health: healthOf(frete.faroId) }))
        ?.message,
    ).toBe('Melhora confirmada na métrica principal com 57% da amostra planejada (148.210 de 260.000 por braço).');
  });
  it('negativo: amostra completa', () => {
    const h: ExperimentHealth = { ...healthOf(frete.faroId), plannedSamplePerArm: 100000 };
    expect(RULES.parada_antecipada(frete, ctx({ norte: norteOf(frete.faroId), health: h }))).toBeNull();
  });
  it('negativo: só tendência', () => {
    const n: MetricResult = { ...norteOf(frete.faroId), label: 'tendencia_de_melhora' };
    expect(RULES.parada_antecipada(frete, ctx({ norte: n, health: healthOf(frete.faroId) }))).toBeNull();
  });
});

describe('passou_da_data', () => {
  it('positivo: rodando depois do fim', () => {
    expect(RULES.passou_da_data(frete, ctx({ today: '2026-10-31' }))?.message).toBe(
      'Fim previsto em 28/10 (3 dias atrás).',
    );
  });
  it('negativo: no último dia ainda vale', () =>
    expect(RULES.passou_da_data(frete, ctx({ today: '2026-10-28' }))).toBeNull());
  it('negativo: já decidido', () => {
    expect(RULES.passou_da_data(byId('FARO-2026-0006'), ctx({ today: '2026-12-01' }))).toBeNull();
  });
});

describe('sem_exposicao', () => {
  const agendado = byId('FARO-2026-0005'); // configurado 13/10, início 21/10
  it('negativo: antes do início não espera exposição', () => {
    expect(RULES.sem_exposicao(agendado, ctx({ campaign: campaign() }))).toBeNull();
  });
  it('negativo: menos de 48 h após o início', () => {
    expect(RULES.sem_exposicao(agendado, ctx({ campaign: campaign(), today: '2026-10-22' }))).toBeNull();
  });
  it('positivo: 48 h após o início sem exposição', () => {
    expect(RULES.sem_exposicao(agendado, ctx({ campaign: campaign(), today: '2026-10-23' }))?.message).toBe(
      'Configurado no DY e sem exposição desde 21/10.',
    );
  });
  it('negativo: exposição registrada', () => {
    const c = campaign({ lastExposureDate: '2026-10-22' });
    expect(RULES.sem_exposicao(agendado, ctx({ campaign: c, today: '2026-10-23' }))).toBeNull();
  });
});

describe('divergencia_config', () => {
  it('positivo: CFG-13 informou campos', () => {
    expect(RULES.divergencia_config(frete, ctx({ divergences: ['split', 'páginas'] }))?.message).toContain(
      'split, páginas',
    );
  });
  it('negativo: sem divergência', () => expect(RULES.divergencia_config(frete, ctx())).toBeNull());
});

describe('conflito_sem_resolucao', () => {
  it('positivo: alto sem decisão', () => {
    expect(RULES.conflito_sem_resolucao(byId('FARO-2026-0001'), ctx())?.message).toContain('FARO-2026-0004');
  });
  it('negativo: alto já resolvido', () =>
    expect(RULES.conflito_sem_resolucao(byId('FARO-2026-0008'), ctx())).toBeNull());
  it('negativo: médio sem decisão não bloqueia', () => {
    const e = with_(frete, {
      overlap: [{ otherFaroId: 'FARO-2026-0003', severity: 'medio', estimatedDailyUsers: 10 }],
    });
    expect(RULES.conflito_sem_resolucao(e, ctx())).toBeNull();
  });
});

const input = (over: Partial<GovernanceInput> = {}): GovernanceInput => ({
  experiments: exps,
  campaigns: camps,
  norteResults: norte,
  health: healths,
  today: TODAY,
  experimentationTeam: 'time-experimentacao@example.com',
  ...over,
});

describe('campanha_orfa', () => {
  it('positivo: ativas sem label faro:', () => {
    expect(orphanAlerts(input()).map((a) => a.dyCampaignId)).toEqual(['dy-2001', 'dy-2002']);
  });
  it('positivo: label para experimento inexistente', () => {
    const c = campaign({ campaignId: 'dy-3', labels: ['faro:FARO-2026-0999'] });
    expect(orphanAlerts(input({ campaigns: [c] }))[0]?.message).toContain('FARO-2026-0999');
  });
  it('negativo: inativa ou com label válido', () => {
    const cs = [campaign({ active: false }), campaign({ labels: ['faro:FARO-2026-0002'] })];
    expect(orphanAlerts(input({ campaigns: cs }))).toEqual([]);
  });
});

describe('motor sobre as fixtures', () => {
  const alerts = evaluateGovernance(input());
  const ids = alerts.map((a) => a.id);

  it('produz exatamente os alertas esperados', () => {
    expect([...ids].sort()).toEqual(
      [
        'campanha_orfa:dy-2001',
        'campanha_orfa:dy-2002',
        'conflito_sem_resolucao:FARO-2026-0001',
        'conflito_sem_resolucao:FARO-2026-0004',
        'decidido_ativo:FARO-2026-0001',
        'design_incompleto:FARO-2026-0001',
        'parada_antecipada:FARO-2026-0002',
        'split_extremo:FARO-2026-0001',
        'srm:FARO-2026-0001',
        'srm:FARO-2026-0004',
      ].sort(),
    );
  });

  it('todo alerta valida no contrato, tem dono e liga à campanha do DY', () => {
    for (const a of alerts) expect(GovernanceAlertSchema.safeParse(a).success, a.id).toBe(true);
    expect(alerts.find((a) => a.id === 'srm:FARO-2026-0004')).toMatchObject({
      dyCampaignId: 'dy-1004',
      owner: 'squad-saude@example.com',
    });
  });

  it('críticos primeiro', () => {
    const firstNonCritical = alerts.findIndex((a) => a.severity !== 'critico');
    expect(alerts.slice(firstNonCritical).every((a) => a.severity !== 'critico')).toBe(true);
    expect(firstNonCritical).toBe(4);
  });

  it('divergência informada pela frente 1 vira alerta', () => {
    const out = evaluateGovernance(input({ configDivergences: { 'FARO-2026-0007': ['split'] } }));
    expect(out.map((a) => a.id)).toContain('divergencia_config:FARO-2026-0007');
  });
});
