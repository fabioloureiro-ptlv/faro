import { describe, expect, it } from 'vitest';
import { mdeMean, mdeProportion, sampleProgress, sampleSizeMean, sampleSizeProportion } from '../src/index.ts';

describe('MDE e amostra', () => {
  it('MDE de proporção e amostra são inversos', () => {
    const n = sampleSizeProportion(0.032, 0.05);
    expect(n).toBeGreaterThan(90000);
    expect(mdeProportion(0.032, n)!).toBeCloseTo(0.05, 3);
  });
  it('MDE de média e amostra são inversos', () => {
    const n = sampleSizeMean(6, 0.05);
    expect(mdeMean(6, n)!).toBeCloseTo(0.05, 3);
  });
  it('retorna null sem base válida', () => {
    expect(mdeProportion(0, 1000)).toBeNull();
    expect(mdeMean(0, 1000)).toBeNull();
  });
  it('progresso e alerta de significância antes da amostra', () => {
    const s = sampleProgress({ requiredPerArm: 40000, nPerArm: [18000, 18100], primaryProbBetter: 0.99 });
    expect(s.minPerArm).toBe(18000);
    expect(s.progress).toBeCloseTo(0.45, 10);
    expect(s.earlySignificanceAlert).toBe(true);
    expect(sampleProgress({ requiredPerArm: 10000, nPerArm: [12000, 11000], primaryProbBetter: 0.99 }).earlySignificanceAlert).toBe(false);
    expect(sampleProgress({ requiredPerArm: 10000, nPerArm: [1000, 1000], primaryProbBetter: 0.6 }).earlySignificanceAlert).toBe(false);
  });
});
