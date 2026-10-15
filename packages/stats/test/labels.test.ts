import { describe, expect, it } from 'vitest';
import { probBetter, significanceLabel } from '../src/index.ts';

describe('rótulos de significância nos limites', () => {
  const cases: [number, string][] = [
    [0.95, 'melhora_confirmada'], [0.9999, 'melhora_confirmada'], [1, 'melhora_confirmada'],
    [0.949, 'tendencia_de_melhora'], [0.8, 'tendencia_de_melhora'],
    [0.799, 'sem_tendencia'], [0.5, 'sem_tendencia'], [0.201, 'sem_tendencia'],
    [0.2, 'tendencia_de_queda'], [0.051, 'tendencia_de_queda'],
    [0.05, 'queda_confirmada'], [0, 'queda_confirmada']
  ];
  for (const [p, label] of cases) {
    it(`${p} → ${label}`, () => expect(significanceLabel(p)).toBe(label));
  }
  it('NaN cai em sem tendência', () => expect(significanceLabel(NaN)).toBe('sem_tendencia'));
});

describe('inversão para lower_better', () => {
  it('z positivo (variante maior) é bom para higher_better e ruim para lower_better', () => {
    const z = 2.5;
    expect(probBetter(z, 'higher_better')).toBeGreaterThan(0.99);
    expect(probBetter(z, 'lower_better')).toBeLessThan(0.01);
    expect(probBetter(z, 'higher_better') + probBetter(z, 'lower_better')).toBeCloseTo(1, 10);
  });
  it('churn menor na variante vira melhora confirmada', () => {
    expect(significanceLabel(probBetter(-3, 'lower_better'))).toBe('melhora_confirmada');
    expect(significanceLabel(probBetter(-3, 'higher_better'))).toBe('queda_confirmada');
  });
});
