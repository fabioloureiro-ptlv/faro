import { describe, expect, it } from 'vitest';
import { chiSquareSurvival, phi, phiInv } from '../src/index.ts';

describe('normal', () => {
  it('phi em pontos conhecidos', () => {
    expect(phi(0)).toBeCloseTo(0.5, 7);
    expect(phi(1.959964)).toBeCloseTo(0.975, 5);
    expect(phi(-1.644854)).toBeCloseTo(0.05, 5);
    expect(phi(3)).toBeCloseTo(0.99865, 5);
  });
  it('phiInv inverte phi', () => {
    for (const p of [0.001, 0.05, 0.2, 0.5, 0.8, 0.95, 0.999]) expect(phi(phiInv(p))).toBeCloseTo(p, 6);
  });
  it('qui-quadrado com df=1 e df=2 em valores tabelados', () => {
    expect(chiSquareSurvival(3.841459, 1)).toBeCloseTo(0.05, 4);
    expect(chiSquareSurvival(10.827566, 1)).toBeCloseTo(0.001, 4);
    expect(chiSquareSurvival(5.991465, 2)).toBeCloseTo(0.05, 4);
    expect(chiSquareSurvival(0, 3)).toBe(1);
  });
});
