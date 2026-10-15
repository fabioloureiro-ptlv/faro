import { describe, expect, it } from 'vitest';
import { median, roundMde, suggestMde, type HistoricalEffect, type MdeSuggestionInput } from '../src/index.ts';

const h = (over: Partial<HistoricalEffect>): HistoricalEffect => ({
  faroId: 'FARO-2026-0001',
  name: 'x',
  metricId: 'conversao',
  deltaRelative: 0.04,
  pages: ['home'],
  bu: 'ecom',
  platforms: ['site'],
  ...over,
});
const target: Omit<MdeSuggestionInput, 'history'> = { metricId: 'conversao', pages: ['carrinho'], bu: 'ecom', platforms: ['site', 'android'] };

describe('sugestão de MDE pela base histórica', () => {
  it('sem histórico da métrica não sugere nada', () => {
    const s = suggestMde({ ...target, history: [h({ metricId: 'receita_por_usuario' })] });
    expect(s).toMatchObject({ suggested: null, sampleCount: 0, basis: [] });
  });

  it('sugere a mediana do |efeito| arredondada a 0,5 p.p., ignorando o sinal', () => {
    const s = suggestMde({
      ...target,
      history: [h({ faroId: 'A', deltaRelative: 0.039 }), h({ faroId: 'B', deltaRelative: -0.012 }), h({ faroId: 'C', deltaRelative: 0.079 })],
    });
    expect(s.medianAbsEffect).toBeCloseTo(0.039);
    expect(s.suggested).toBe(0.04);
    expect(s).toMatchObject({ sampleCount: 3, improved: 2, worsened: 1 });
  });

  it('ordena a base pelos mais parecidos (página, BU, plataforma)', () => {
    const s = suggestMde({
      ...target,
      history: [
        h({ faroId: 'longe', pages: ['home'], bu: 'saude', platforms: ['ios'] }),
        h({ faroId: 'perto', pages: ['carrinho'], bu: 'ecom', platforms: ['site'] }),
        h({ faroId: 'meio', pages: ['home'], bu: 'ecom', platforms: ['site'] }),
      ],
    });
    expect(s.basis.map((b) => b.faroId)).toEqual(['perto', 'meio', 'longe']);
    expect(s.basis[0]!.similarity).toBe(3.5);
  });

  it('limita ao intervalo do slider', () => {
    expect(roundMde(0.0001)).toBe(0.01);
    expect(roundMde(1.08)).toBe(0.3);
    expect(roundMde(0.0426)).toBe(0.045);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2, 4])).toBe(2.5);
  });
});
