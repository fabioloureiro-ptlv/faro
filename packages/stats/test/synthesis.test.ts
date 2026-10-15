import { describe, expect, it } from 'vitest';
import { formatDelta, synthesize } from '../src/index.ts';

describe('síntese (MET-13)', () => {
  it('reproduz a frase do Nexus no formato do visualizador', () => {
    const s = synthesize({
      variantKey: 'home_nova', variantName: 'home nova', platform: 'all',
      metrics: [
        { metricId: 'receita_por_usuario', name: 'Receita por usuário', role: 'norte', deltaRelative: 1.081, probBetter: 1, label: 'melhora_confirmada' },
        { metricId: 'conversao', name: 'Conversão', role: 'guarda', deltaRelative: 2.413, probBetter: 1, label: 'melhora_confirmada' },
        { metricId: 'conversao_saude', name: 'Conversão em saúde', role: 'outra', deltaRelative: -0.747, probBetter: 0.09, label: 'tendencia_de_queda' },
        { metricId: 'churn_clube', name: 'Churn do clube', role: 'outra', deltaRelative: 1.398, probBetter: 0.19, label: 'sem_tendencia' }
      ]
    });
    expect(s.text).toBe('home nova (consolidado): NORTE receita por usuário +108,1% (melhora confirmada, 100%) · conversão +241,3% (melhora confirmada, 100%) · conversão em saúde −74,7% (tendência de queda, 9%).');
    expect(s.parts.map((p) => p.metricId)).toEqual(['receita_por_usuario', 'conversao', 'conversao_saude']);
  });
  it('limita a três métricas além da NORTE, por |delta|', () => {
    const metrics = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ metricId: id, name: id, role: 'secundaria' as const, deltaRelative: (i + 1) / 10, probBetter: 0.99, label: 'melhora_confirmada' as const }));
    const s = synthesize({ variantKey: 'v', variantName: 'Variante A', platform: 'android', metrics });
    expect(s.parts.map((p) => p.metricId)).toEqual(['e', 'd', 'c']);
    expect(s.text.startsWith('Variante A (Android): ')).toBe(true);
  });
  it('formata deltas em pt-BR', () => {
    expect(formatDelta(0.05)).toBe('+5,0%');
    expect(formatDelta(-0.107)).toBe('−10,7%');
    expect(formatDelta(0)).toBe('0,0%');
  });
});
