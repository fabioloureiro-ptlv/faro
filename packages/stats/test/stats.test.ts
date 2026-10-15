import { describe, expect, it } from 'vitest';
import { compareMeans, compareProportions, currentMde, phi, sampleSizeProportion, srmPValue } from '../src/index.ts';

describe('phi', () => {
  it('bate com valores conhecidos da normal', () => {
    expect(phi(0)).toBeCloseTo(0.5, 6);
    expect(phi(1.96)).toBeCloseTo(0.975, 4);
    expect(phi(-1.96)).toBeCloseTo(0.025, 4);
  });
});

describe('compareProportions (MET-06)', () => {
  it('sem diferença fica sem tendência', () => {
    const r = compareProportions({ successes: 320, n: 10000 }, { successes: 322, n: 10000 });
    expect(r.label).toBe('sem_tendencia');
  });

  it('melhora grande e amostra grande confirma', () => {
    const r = compareProportions({ successes: 3200, n: 100000 }, { successes: 3600, n: 100000 });
    expect(r.probBetter).toBeGreaterThan(0.95);
    expect(r.label).toBe('melhora_confirmada');
  });

  it('lower_better inverte a leitura (queda do churn é melhora)', () => {
    const r = compareProportions({ successes: 500, n: 10000 }, { successes: 400, n: 10000 }, 'lower_better');
    expect(r.probBetter).toBeGreaterThan(0.95);
  });

  it('rótulos nos limites: 80% é tendência, 95% confirma', () => {
    expect(compareMeans({ mean: 1, variance: 1, n: 1 }, { mean: 1 + 0.8416, variance: 0, n: 1 }).label).toBe('tendencia_de_melhora');
    expect(compareMeans({ mean: 1, variance: 1, n: 1 }, { mean: 1 + 1.6449, variance: 0, n: 1 }).label).toBe('melhora_confirmada');
  });
});

describe('srmPValue (MET-08)', () => {
  it('split dentro do esperado tem p alto', () => {
    expect(srmPValue([5000, 5050], [0.5, 0.5])).toBeGreaterThan(0.05);
  });

  it('o SRM do Nexus (1,9% x 98,1% contra 2% x 98%) dá p < 0,001 — achado da frente 2', () => {
    const total = 1_100_000;
    const p = srmPValue([Math.round(total * 0.019), Math.round(total * 0.981)], [0.02, 0.98]);
    expect(p).toBeLessThan(0.001);
  });
});

describe('amostra e MDE (CFG-07, MET-09)', () => {
  it('p = 3,2% e MDE 5% dá ~189.943 por braço (mesmo valor do config-core)', () => {
    expect(sampleSizeProportion(0.032, 0.05)).toBeGreaterThan(185000);
    expect(sampleSizeProportion(0.032, 0.05)).toBeLessThan(195000);
  });

  it('MDE atual cresce com o erro padrão', () => {
    expect(currentMde(0.01)).toBeCloseTo(0.028, 3);
  });
});
