import { describe, expect, it } from 'vitest';
import type { Experiment } from '@faro/contracts';
import { suggestDates } from '@faro/config-core';
import { busyWindows, DY_ASSUMED_REMAINING_DAYS } from './busy.ts';

const exp = (faroId: string, over: Partial<Experiment> & { pages?: string[]; platforms?: string[]; start?: string; end?: string }): Experiment =>
  ({
    faroId,
    name: `Teste ${faroId}`,
    status: 'rodando',
    allocation: {
      pages: over.pages ?? [],
      platforms: over.platforms ?? ['site'],
      startDate: over.start ?? '2026-09-01',
      endDate: over.end ?? '2026-10-14',
    },
    ...(over.status ? { status: over.status } : {}),
  }) as unknown as Experiment;

const ASOF = '2026-10-14';
const base = { faroId: 'FARO-2026-0100', pages: ['home'], asOf: ASOF };

describe('testes que ocupam a mesma página (sugestão de datas)', () => {
  it('um teste ativo da DY, na mesma página, ocupa a janela com fim estimado', () => {
    const r = busyWindows({ ...base, experiments: [exp('FARO-0000-0001', { pages: ['home'], platforms: ['site'] })] });
    expect(r.dy).toEqual({ considerados: 1, semPagina: 0, asOf: ASOF });
    expect(r.busy).toEqual([
      expect.objectContaining({ faroId: 'FARO-0000-0001', status: 'na_dy', endEstimated: true, endDate: '2026-10-28' }),
    ]);
    expect(DY_ASSUMED_REMAINING_DAYS).toBe(14);
  });

  it('a sugestão empurra o início para depois do teste da DY', () => {
    const { busy } = busyWindows({ ...base, experiments: [exp('FARO-0000-0001', { pages: ['home'] })] });
    const s = suggestDates({ today: ASOF, durationDays: 14, busy });
    expect(s.overlapping.map((b) => b.faroId)).toEqual(['FARO-0000-0001']);
    expect(s.freeWindow?.startDate).toBe('2026-10-29');
  });

  it('teste da DY que já terminou ou que está em outra página não entra', () => {
    const r = busyWindows({
      ...base,
      experiments: [
        exp('FARO-0000-0002', { pages: ['home'], end: '2026-10-10' }), // acabou antes do último dia de dados
        exp('FARO-0000-0003', { pages: ['busca'] }),
      ],
    });
    expect(r.busy).toEqual([]);
    expect(r.dy.considerados).toBe(0);
  });

  it('a plataforma não importa: o que vale é a página', () => {
    const r = busyWindows({ ...base, experiments: [exp('FARO-0000-0004', { pages: ['home'], platforms: ['android', 'ios'] })] });
    expect(r.busy.map((b) => b.faroId)).toEqual(['FARO-0000-0004']);
  });

  it('teste ativo da DY sem página identificada não dá para casar: fica de fora e é contado à parte', () => {
    const r = busyWindows({ ...base, experiments: [exp('FARO-0000-0005', { pages: [] }), exp('FARO-0000-0006', { pages: [], platforms: ['ios'] })] });
    expect(r.busy).toEqual([]);
    expect(r.dy).toEqual({ considerados: 0, semPagina: 2, asOf: ASOF });
  });

  it('experimento do Faro: na DY ou em design (com datas e na mesma página); o resto fica de fora', () => {
    const r = busyWindows({
      ...base,
      experiments: [
        exp('FARO-2026-0001', { pages: ['home'], status: 'configurado_no_dy', start: '2026-10-20', end: '2026-11-17' }),
        exp('FARO-2026-0002', { pages: ['home'], status: 'rodando', start: '2026-10-01', end: '2026-10-30' }),
        exp('FARO-2026-0004', { pages: ['home'], status: 'rascunho', start: '2026-11-01', end: '2026-11-14' }),
        exp('FARO-2026-0005', { pages: ['home'], status: 'design_completo', start: '2026-11-15', end: '2026-11-28' }),
        exp('FARO-2026-0006', { pages: ['home'], status: 'decidido' }),
        exp('FARO-2026-0007', { pages: ['home'], status: 'cancelado' }),
        exp('FARO-2026-0100', { pages: ['home'], status: 'rodando' }), // o próprio
        exp('FARO-2026-0003', { pages: ['busca'], status: 'rodando' }),
      ],
    });
    expect(r.busy.map((b) => [b.faroId, b.status])).toEqual([
      ['FARO-2026-0001', 'na_dy'],
      ['FARO-2026-0002', 'na_dy'],
      ['FARO-2026-0004', 'em_design'],
      ['FARO-2026-0005', 'em_design'],
    ]);
    expect(r.busy[0]).not.toHaveProperty('endEstimated');
    expect(r.busy[0]).toMatchObject({ startDate: '2026-10-20', endDate: '2026-11-17' });
  });
});
