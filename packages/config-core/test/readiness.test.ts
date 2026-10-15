import { describe, expect, it } from 'vitest';
import {
  audienceChecks,
  evaluateDesignGate,
  overlapCheck,
  statusAfterSave,
  unlockedSteps,
} from '../src/index.ts';
import { blankDraft, draftFromTemplate, duplicateDraft } from '../src/index.ts';
import templates from '@faro/contracts/fixtures/templates.json' with { type: 'json' };
import type { Experiment, Template } from '@faro/contracts';
import { completeExperiment } from './helpers.ts';

describe('etapas liberadas e status (CFG-01)', () => {
  it('rascunho em branco só libera a etapa 1', () => {
    const d = { ...blankDraft({ ownerEmail: 'pm@example.com' }), faroId: 'FARO-2026-0001', status: 'rascunho', createdAt: '', updatedAt: '' } as Experiment;
    const gate = evaluateDesignGate(d);
    expect(unlockedSteps(gate, audienceChecks(d), overlapCheck(d))).toEqual([1]);
  });

  it('design completo libera 2; público ok libera 3; sobreposição resolvida libera 4', () => {
    const e = completeExperiment({ overlap: [{ otherFaroId: 'FARO-2026-0001', severity: 'alto', estimatedDailyUsers: 9000 }] });
    const gate = evaluateDesignGate(e);
    expect(unlockedSteps(gate, audienceChecks(e), overlapCheck(e))).toEqual([1, 2, 3]);
    e.overlap![0]!.resolution = 'exclusao_mutua';
    expect(unlockedSteps(gate, audienceChecks(e), overlapCheck(e))).toEqual([1, 2, 3, 4]);
  });

  it('conflito baixo não exige decisão', () => {
    const e = completeExperiment({ overlap: [{ otherFaroId: 'FARO-2026-0001', severity: 'baixo', estimatedDailyUsers: 100 }] });
    expect(overlapCheck(e).ok).toBe(true);
  });

  it('split precisa ter um valor por grupo e somar 100%', () => {
    const e = completeExperiment({ allocation: { ...completeExperiment().allocation, split: [0.6, 0.3] } });
    expect(audienceChecks(e).find((c) => c.id === 'split')!.ok).toBe(false);
  });

  it('transições de status pré-DY', () => {
    expect(statusAfterSave('rascunho', true, false)).toBe('design_completo');
    expect(statusAfterSave('design_completo', false, false)).toBe('rascunho');
    expect(statusAfterSave('pronto_para_configurar', true, true)).toBe('pronto_para_configurar');
    expect(statusAfterSave('pronto_para_configurar', true, false)).toBe('design_completo');
    expect(statusAfterSave('configurado_no_dy', false, false)).toBe('configurado_no_dy');
  });
});

describe('rascunhos (CFG-15)', () => {
  it('template preenche design e alocação', () => {
    const d = draftFromTemplate(templates[1] as Template, { ownerEmail: 'pm@example.com' });
    expect(d.templateId).toBe('tpl-teste-preco');
    expect(d.design.primaryMetricId).toBe('receita_por_usuario');
    expect(d.allocation.pages).toEqual(['pdp', 'carrinho']);
  });

  it('duplicar limpa datas, DY, decisão e sobreposição', () => {
    const src = completeExperiment({
      status: 'encerrado',
      legacy: true,
      dy: { campaignName: 'x', campaignId: '123', labels: [] },
      decision: { outcome: 'sem_vencedor', rationale: 'x', decidedBy: 'pm@example.com', decidedAt: '2026-10-01T00:00:00Z' },
      overlap: [{ otherFaroId: 'FARO-2026-0001', severity: 'alto', estimatedDailyUsers: 1 }],
    });
    const d = duplicateDraft(src, { ownerEmail: 'outra@example.com' });
    expect(d.allocation.startDate).toBe('');
    expect(d.allocation.endDate).toBe('');
    expect(d).not.toHaveProperty('dy');
    expect(d).not.toHaveProperty('decision');
    expect(d).not.toHaveProperty('overlap');
    expect(d.legacy).toBe(false);
    expect(d.design).toEqual(src.design);
    expect(d.design).not.toBe(src.design);
  });
});
