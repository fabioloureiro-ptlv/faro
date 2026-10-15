import { describe, expect, it } from 'vitest';
import { sampleSizeMean, sampleSizePerGroup, sampleSizeProportion, Z_ALPHA, Z_POWER } from '../src/index.ts';

describe('sampleSize (CFG-07)', () => {
  it('usa z exatos de α = 5% bicaudal e poder 80%', () => {
    expect(Z_ALPHA).toBeCloseTo(1.95996, 5);
    expect(Z_POWER).toBeCloseTo(0.84162, 5);
    // 2·(zα/2 + zβ)² ≈ 15,7, a constante do protótipo
    expect(2 * (Z_ALPHA + Z_POWER) ** 2).toBeCloseTo(15.698, 3);
  });

  it('proporção: valores conhecidos', () => {
    // 15,6978 · 0,032 · 0,968 / (0,032 · 0,05)² = 189.942,6
    expect(sampleSizeProportion(0.032, 0.05)).toBe(189943);
    // p = 50%, MDE 10%: 15,6978 · 0,25 / 0,0025 = 1.569,8
    expect(sampleSizeProportion(0.5, 0.1)).toBe(1570);
  });

  it('média: valores conhecidos', () => {
    // 15,6978 · 36 / 0,0025 = 226.047,7
    expect(sampleSizeMean(6, 0.05)).toBe(226048);
    expect(sampleSizeMean(1, 0.1)).toBe(1570);
  });

  it('entradas inválidas retornam null', () => {
    expect(sampleSizeProportion(0, 0.05)).toBeNull();
    expect(sampleSizeProportion(1, 0.05)).toBeNull();
    expect(sampleSizeProportion(0.1, 0)).toBeNull();
    expect(sampleSizeMean(0, 0.05)).toBeNull();
    expect(sampleSizeMean(2, -0.1)).toBeNull();
  });

  it('usa a linha de base do catálogo e respeita baselineOverride', () => {
    const conv = { kind: 'proportion' as const, baseline: 0.032 };
    expect(sampleSizePerGroup({ metric: conv, mdeRelative: 0.05 })).toBe(189943);
    expect(sampleSizePerGroup({ metric: conv, mdeRelative: 0.1, baselineOverride: 0.5 })).toBe(1570);
    const rpu = { kind: 'mean' as const, baseline: 24.5, cv: 6 };
    expect(sampleSizePerGroup({ metric: rpu, mdeRelative: 0.05 })).toBe(226048);
    expect(sampleSizePerGroup({ metric: { kind: 'ratio', cv: 1 }, mdeRelative: 0.1 })).toBe(1570);
    expect(sampleSizePerGroup({ metric: { kind: 'mean' }, mdeRelative: 0.1 })).toBeNull();
  });
});
