import { describe, expect, it } from 'vitest';
import { recommend, type RecommendInput } from '../src/index.ts';

const base: RecommendInput = {
  status: 'rodando', hasData: true, srmPValue: 0.4,
  variants: [{ key: 'c', name: 'Controle', isControl: true, observedShare: 0.5 }, { key: 'v', name: 'Variante A', isControl: false, observedShare: 0.5 }],
  primary: { name: 'conversão', probBetter: 0.6 }, guardrails: [], sampleProgress: 0.4, minPerArm: 4000, requiredPerArm: 10000
};

describe('recomendação (MET-12), na ordem das regras', () => {
  it('agendado sem dados', () => expect(recommend({ ...base, hasData: false }).code).toBe('aguardando_dados'));
  it('encerrado mantém a decisão', () => {
    const r = recommend({ ...base, status: 'encerrado', decisionText: 'Vencedor: Variante A' });
    expect(r.code).toBe('encerrado');
    expect(r.title).toBe('Vencedor: Variante A');
  });
  it('SRM vem antes de tudo que depende dos dados', () => {
    const r = recommend({ ...base, srmPValue: 0.0001, primary: { name: 'conversão', probBetter: 0.99 }, sampleProgress: 1 });
    expect(r.code).toBe('investigar_srm');
    expect(r.severity).toBe('risk');
  });
  it('variante com ~100% do tráfego: desligar a campanha', () => {
    const r = recommend({ ...base, variants: [{ key: 'c', name: 'home antiga', isControl: true, observedShare: 0.019 }, { key: 'v', name: 'home nova', isControl: false, observedShare: 0.981 }], primary: { name: 'receita por usuário', probBetter: 1 }, sampleProgress: 1 });
    expect(r.code).toBe('desligar_campanha');
  });
  it('guardrail piorado prevalece sobre NORTE confirmada', () => {
    const r = recommend({ ...base, primary: { name: 'conversão', probBetter: 0.99 }, guardrails: [{ metricId: 'devol', name: 'Taxa de devolução', probBetter: 0.02 }], sampleProgress: 1 });
    expect(r.code).toBe('avaliar_guardrail');
    expect(r.body).toContain('Taxa de devolução');
  });
  it('NORTE confirmada com amostra completa: implementar', () => {
    expect(recommend({ ...base, primary: { name: 'conversão', probBetter: 0.96 }, sampleProgress: 1 }).code).toBe('implementar');
  });
  it('NORTE confirmada com amostra incompleta: manter até a amostra', () => {
    const r = recommend({ ...base, primary: { name: 'conversão', probBetter: 0.96 }, sampleProgress: 0.45 });
    expect(r.code).toBe('manter_ate_amostra');
    expect(r.body).toContain('45%');
  });
  it('NORTE com queda confirmada: desligar a variante', () => {
    expect(recommend({ ...base, primary: { name: 'conversão', probBetter: 0.03 } }).code).toBe('desligar_variante');
  });
  it('amostra completa sem diferença: encerrar sem vencedor', () => {
    expect(recommend({ ...base, sampleProgress: 1 }).code).toBe('encerrar_sem_vencedor');
  });
  it('demais casos: manter rodando', () => {
    expect(recommend(base).code).toBe('manter_rodando');
  });
});
