import { describe, expect, it } from 'vitest';
import type { Experiment } from '@faro/contracts';
import { evaluateDesignGate, type GateCheckId } from '../src/index.ts';
import { completeExperiment } from './helpers.ts';

const failing = (e: Experiment, known?: Set<string>) =>
  evaluateDesignGate(e, known).checks.filter((c) => !c.ok).map((c) => c.id);

function withDesign(patch: Partial<Experiment['design']>, over: Partial<Experiment> = {}) {
  const e = completeExperiment(over);
  return { ...e, design: { ...e.design, ...patch } };
}

describe('gate de design (CFG-02)', () => {
  it('design completo passa com checklist cheio', () => {
    const r = evaluateDesignGate(completeExperiment());
    expect(r.complete).toBe(true);
    expect(r.done).toBe(r.total);
  });

  const cases: [GateCheckId, Experiment][] = [
    ['nome', completeExperiment({ name: 'abc' })],
    ['bu', completeExperiment({ bu: 'x' as Experiment['bu'] })],
    ['squad', completeExperiment({ ownerSquad: ' ' })],
    ['contexto', withDesign({ context: 'curto demais' })],
    ['hipotese', withDesign({ hypothesis: { change: 'mudar o botão', expectedEffect: '', because: 'sim, porque' } })],
    ['controle_variantes', withDesign({ control: { name: 'Controle', description: '' } })],
    ['controle_variantes', withDesign({ variants: [] })],
    ['controle_variantes', withDesign({ variants: [{ key: 'a', name: 'A', description: '' }] })],
    ['metrica_primaria', withDesign({ primaryMetricId: '' })],
    ['metricas_secundarias', withDesign({ secondaryMetricIds: [] })],
    ['primaria_fora_das_secundarias', withDesign({ secondaryMetricIds: ['conversao_carrinho'] })],
    ['mde', withDesign({ mdeRelative: 0 })],
    ['figma', withDesign({ control: { name: 'Controle', description: 'Card atual', figmaUrl: 'https://evil.com/figma.com/x' } })],
  ];

  it.each(cases)('falha isolada em %s', (id, exp) => {
    expect(failing(exp)).toEqual([id]);
    const check = evaluateDesignGate(exp).checks.find((c) => c.id === id)!;
    expect(check.message).toBeTruthy();
  });

  it('hipótese aponta qual parte falta', () => {
    const r = evaluateDesignGate(withDesign({ hypothesis: { change: '', expectedEffect: 'sobe', because: '' } }));
    expect(r.checks.find((c) => c.id === 'hipotese')!.message).toBe('Preencha “Se” (a mudança), “porque” (o motivo).');
  });

  it('Figma: aceita figma.com e subdomínios, vazio é opcional', () => {
    const ok = withDesign({ control: { name: 'C', description: 'Atual', figmaUrl: 'https://www.figma.com/design/abc/x' } });
    expect(failing(ok)).toEqual([]);
    const http = withDesign({ control: { name: 'C', description: 'Atual', figmaUrl: 'http://figma.com/file/x' } });
    expect(failing(http)).toEqual(['figma']);
    const empty = withDesign({ control: { name: 'C', description: 'Atual', figmaUrl: '' } });
    expect(failing(empty)).toEqual([]);
  });

  it('com catálogo, métrica desconhecida falha (CFG-04)', () => {
    const known = new Set(['conversao', 'receita_por_usuario']);
    expect(failing(completeExperiment(), known)).toEqual(['metrica_primaria']);
  });
});
