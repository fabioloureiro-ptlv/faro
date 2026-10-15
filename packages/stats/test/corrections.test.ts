import { describe, expect, it } from 'vitest';
import { benjaminiHochberg, cupedAdjust, dunnettSidak, holm } from '../src/index.ts';

describe('correções', () => {
  it('Holm é monotônico e limita em 1', () => {
    // ordenado: 0,01×3 = 0,03; 0,03×2 = 0,06; 0,04×1 = 0,04 → sobe para 0,06 (monotonia)
    expect(holm([0.01, 0.04, 0.03]).map((x) => +x.toFixed(10))).toEqual([0.03, 0.06, 0.06]);
    expect(holm([0.9, 0.8])).toEqual([1, 1]);
  });
  it('Benjamini-Hochberg', () => {
    const q = benjaminiHochberg([0.01, 0.02, 0.03, 0.04]);
    expect(q.map((x) => +x.toFixed(4))).toEqual([0.04, 0.04, 0.04, 0.04]);
  });
  it('Dunnett-Šidák com uma variante não muda o p', () => {
    expect(dunnettSidak(0.03, 1)).toBe(0.03);
    expect(dunnettSidak(0.03, 2)).toBeCloseTo(1 - 0.97 ** 2, 10);
  });
});

describe('CUPED', () => {
  it('reduz variância quando a covariável é correlacionada e preserva a média', () => {
    const x = Array.from({ length: 200 }, (_, i) => i);
    const y = x.map((xi) => 2 * xi + ((xi * 7) % 5));
    const r = cupedAdjust(y, x);
    expect(r.theta).toBeCloseTo(2, 1);
    expect(r.varianceReduction).toBeGreaterThan(0.99);
    const mean = (v: number[]) => v.reduce((s, a) => s + a, 0) / v.length;
    expect(mean(r.adjusted)).toBeCloseTo(mean(y), 8);
  });
});
