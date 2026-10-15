import { describe, expect, it } from 'vitest';
import nexus from '@faro/contracts/fixtures/nexus.json' with { type: 'json' };
import type { Experiment } from '@faro/contracts';
import { checkConsistency } from '../src/index.ts';
import { completeExperiment } from './helpers.ts';

const snap = (over = {}) => ({
  campaignId: 'dy-1',
  refdate: '2026-10-20',
  variations: [
    { name: 'FARO-2026-0042:controle', users: 5000 },
    { name: 'FARO-2026-0042:a', users: 5000 },
  ],
  platforms: ['site', 'android', 'ios'] as Experiment['allocation']['platforms'],
  ...over,
});

describe('checagem D+1 (CFG-13)', () => {
  it('configuração igual ao planejado não gera divergência', () => {
    expect(checkConsistency(completeExperiment(), snap())).toEqual([]);
  });

  it('split dentro de ±2 p.p. passa; fora, diverge', () => {
    const ok = snap({ variations: [{ name: 'FARO-2026-0042:controle', users: 5190 }, { name: 'FARO-2026-0042:a', users: 4810 }] });
    expect(checkConsistency(completeExperiment(), ok)).toEqual([]);
    const bad = snap({ variations: [{ name: 'FARO-2026-0042:controle', users: 5300 }, { name: 'FARO-2026-0042:a', users: 4700 }] });
    expect(checkConsistency(completeExperiment(), bad).map((d) => d.kind)).toEqual(['split', 'split']);
  });

  it('nome trocado, variação extra e plataformas', () => {
    const s = snap({
      variations: [
        { name: 'FARO-2026-0042:controle', users: 3333 },
        { name: 'Variante 1', users: 3333 },
        { name: 'Variante 2', users: 3334 },
      ],
      platforms: ['site', 'android'],
    });
    const kinds = checkConsistency(completeExperiment({ allocation: { ...completeExperiment().allocation, platforms: ['site', 'ios'] } }), s).map((d) => d.kind);
    expect(kinds).toEqual(['nome_variacao', 'variacao_extra', 'plataforma_ausente', 'plataforma_extra']);
  });

  it('Nexus: split observado bate com o planejado 2% × 98%', () => {
    const exp = nexus.experiment as Experiment;
    const d = checkConsistency(exp, { ...nexus.dyExport, platforms: ['android', 'ios'] });
    expect(d).toEqual([]);
  });
});
