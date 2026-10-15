import { describe, expect, it } from 'vitest';
import { estimateDuration, periodDays } from '../src/index.ts';

const base = { split: [0.5, 0.5], startDate: '2026-10-19', endDate: '2026-11-09' };

describe('duração e viabilidade (CFG-08)', () => {
  it('período conta início e fim', () => {
    expect(periodDays('2026-10-19', '2026-11-09')).toBe(22);
    expect(periodDays('2026-10-19', '2026-10-18')).toBeNull();
  });

  it('split igual: amostra total ÷ elegíveis por dia', () => {
    const r = estimateDuration({ ...base, nPerGroup: 100_000, eligibleDaily: 20_000 });
    expect(r.totalSample).toBe(200_000);
    expect(r.durationDays).toBe(10);
    expect(r.alerts).toEqual([]);
    expect(r.blocking).toBe(false);
  });

  it('split desigual: o menor grupo precisa atingir n', () => {
    const r = estimateDuration({ ...base, split: [0.2, 0.8], nPerGroup: 10_000, eligibleDaily: 10_000 });
    expect(r.totalSample).toBe(50_000);
    expect(r.durationDays).toBe(5);
  });

  it('duração maior que o período bloqueia', () => {
    const r = estimateDuration({ ...base, nPerGroup: 1_000_000, eligibleDaily: 20_000 });
    expect(r.durationDays).toBe(100);
    expect(r.blocking).toBe(true);
    expect(r.alerts.map((a) => a.code)).toEqual(['periodo_insuficiente', 'mais_de_6_semanas']);
  });

  it('menos de 7 dias alerta sem bloquear', () => {
    const r = estimateDuration({ ...base, nPerGroup: 1_000, eligibleDaily: 20_000 });
    expect(r.durationDays).toBe(1);
    expect(r.blocking).toBe(false);
    expect(r.alerts.map((a) => a.code)).toEqual(['menos_de_7_dias']);
  });

  it('mais de 6 semanas alerta', () => {
    const r = estimateDuration({ split: [0.5, 0.5], startDate: '2026-10-01', endDate: '2026-12-31', nPerGroup: 450_000, eligibleDaily: 20_000 });
    expect(r.durationDays).toBe(45);
    expect(r.blocking).toBe(false);
    expect(r.alerts.map((a) => a.code)).toEqual(['mais_de_6_semanas']);
  });

  it('sem elegíveis ou split com zero não estima', () => {
    expect(estimateDuration({ ...base, nPerGroup: 1000, eligibleDaily: 0 }).alerts[0]?.code).toBe('sem_elegiveis');
    expect(estimateDuration({ ...base, split: [0, 1], nPerGroup: 1000, eligibleDaily: 100 }).durationDays).toBeNull();
  });
});
