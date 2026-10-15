import { describe, expect, it } from 'vitest';
import { armValue, evaluateMetric, meanDelta, ratioDelta, twoProportionZ } from '../src/index.ts';

describe('teste z de duas proporções', () => {
  it('reproduz um caso clássico (1000 vs 1000, 10% vs 13%)', () => {
    const r = twoProportionZ({ successes: 100, n: 1000 }, { successes: 130, n: 1000 }, 'higher_better');
    expect(r.controlValue).toBeCloseTo(0.1, 10);
    expect(r.variantValue).toBeCloseTo(0.13, 10);
    expect(r.deltaRelative).toBeCloseTo(0.3, 10);
    // se pooled = sqrt(0,115 × 0,885 × 2/1000) = 0,014267 → z = 0,03 / 0,014267
    expect(r.z).toBeCloseTo(2.1027, 3);
    expect(r.pValue).toBeCloseTo(0.0355, 3);
    expect(r.probBetter).toBeCloseTo(0.9822, 3);
    expect(r.label).toBe('melhora_confirmada');
    expect(r.ci95.lower).toBeLessThan(0.3);
    expect(r.ci95.upper).toBeGreaterThan(0.3);
  });
  it('sem diferença dá probBetter 0,5 e sem tendência', () => {
    const r = twoProportionZ({ successes: 50, n: 1000 }, { successes: 50, n: 1000 }, 'higher_better');
    expect(r.probBetter).toBeCloseTo(0.5, 6);
    expect(r.label).toBe('sem_tendencia');
  });
  it('Agresti-Caffo muda só o IC: contém o delta, difere de Wald em amostra pequena e converge em amostra grande', () => {
    const wald = twoProportionZ({ successes: 2, n: 40 }, { successes: 8, n: 40 }, 'higher_better');
    const ac = twoProportionZ({ successes: 2, n: 40 }, { successes: 8, n: 40 }, 'higher_better', { proportionCi: 'agresti_caffo' });
    expect(ac.deltaRelative).toBe(wald.deltaRelative);
    expect(ac.probBetter).toBe(wald.probBetter);
    expect(ac.ci95.lower).toBeLessThan(ac.deltaRelative);
    expect(ac.ci95.upper).toBeGreaterThan(ac.deltaRelative);
    expect(ac.ci95.upper).not.toBeCloseTo(wald.ci95.upper, 3);
    const bigW = twoProportionZ({ successes: 20000, n: 400000 }, { successes: 21000, n: 400000 }, 'higher_better');
    const bigA = twoProportionZ({ successes: 20000, n: 400000 }, { successes: 21000, n: 400000 }, 'higher_better', { proportionCi: 'agresti_caffo' });
    expect(bigA.ci95.lower).toBeCloseTo(bigW.ci95.lower, 3);
    expect(bigA.ci95.upper).toBeCloseTo(bigW.ci95.upper, 3);
  });
});

describe('médias e razões por delta method', () => {
  it('meanDelta com variâncias conhecidas', () => {
    const r = meanDelta({ mean: 20, variance: 400, n: 10000 }, { mean: 21, variance: 441, n: 10000 }, 'higher_better');
    expect(r.deltaRelative).toBeCloseTo(0.05, 10);
    expect(r.se).toBeCloseTo(Math.sqrt(400 / 10000 + 441 / 10000), 10);
    expect(r.z).toBeCloseTo(1 / r.se, 10);
    expect(r.label).toBe('melhora_confirmada');
  });
  it('ratioDelta: razão sem covariância reduz-se à soma das variâncias relativas', () => {
    const arm = (num: number, den: number) => ({ numeratorMean: num, denominatorMean: den, numeratorVariance: 4, denominatorVariance: 0.25, covariance: 0, n: 5000 });
    const r = ratioDelta(arm(10, 2), arm(10.5, 2), 'higher_better');
    expect(r.controlValue).toBe(5);
    expect(r.variantValue).toBe(5.25);
    expect(r.deltaRelative).toBeCloseTo(0.05, 10);
    const varC = 25 * (4 / 100 + 0.25 / 4) / 5000;
    const varV = (5.25 ** 2) * (4 / 110.25 + 0.25 / 4) / 5000;
    expect(r.se).toBeCloseTo(Math.sqrt(varC + varV), 10);
  });
  it('evaluateMetric despacha por kind e valida os braços', () => {
    expect(evaluateMetric({ kind: 'proportion', direction: 'higher_better', control: { successes: 1, n: 10 }, variant: { successes: 2, n: 10 } }).variantValue).toBe(0.2);
    expect(() => evaluateMetric({ kind: 'mean', direction: 'higher_better', control: { successes: 1, n: 10 }, variant: { successes: 2, n: 10 } })).toThrow();
    expect(armValue('ratio', { numeratorMean: 6, denominatorMean: 3, numeratorVariance: 0, denominatorVariance: 0, covariance: 0, n: 1 })).toBe(2);
  });
});
