import { describe, expect, it } from 'vitest';
import { addDays, suggestDates, suggestedDays, type BusyWindow } from '../src/index.ts';

const busy = (faroId: string, startDate: string, endDate: string): BusyWindow => ({ faroId, name: faroId, startDate, endDate });

describe('sugestão de datas com testes interpostos', () => {
  it('arredonda para semanas inteiras e nunca abaixo de 7 dias', () => {
    expect(suggestedDays(null)).toBe(7);
    expect(suggestedDays(3)).toBe(7);
    expect(suggestedDays(8)).toBe(14);
    expect(suggestedDays(28)).toBe(28);
  });

  it('começa no dia seguinte e marca a base da sugestão', () => {
    const s = suggestDates({ today: '2026-10-15', durationDays: 20, busy: [] });
    expect(s).toMatchObject({ startDate: '2026-10-16', endDate: '2026-11-05', days: 21, basedOn: 'amostra', overlapping: [] });
    expect(s.freeWindow).toBeUndefined();
    expect(suggestDates({ today: '2026-10-15', durationDays: null, busy: [] }).basedOn).toBe('minimo');
  });

  it('lista os testes interpostos e aponta a próxima janela livre', () => {
    const s = suggestDates({
      today: '2026-10-15',
      durationDays: 14,
      busy: [busy('FARO-2026-0002', '2026-09-30', '2026-10-28'), busy('FARO-2026-0009', '2026-12-01', '2026-12-10'), busy('FARO-2026-0003', '2026-10-05', '2026-11-02')],
    });
    expect(s.overlapping.map((b) => b.faroId)).toEqual(['FARO-2026-0002', 'FARO-2026-0003']);
    // Depois do último interposto (02/11) começa dia 03/11, 14 dias.
    expect(s.freeWindow).toEqual({ startDate: '2026-11-03', endDate: '2026-11-16', days: 14, afterFaroIds: ['FARO-2026-0002', 'FARO-2026-0003'] });
  });

  it('a janela livre pula um teste que começa logo depois', () => {
    const s = suggestDates({
      today: '2026-10-15',
      durationDays: 7,
      busy: [busy('A', '2026-10-10', '2026-10-20'), busy('B', '2026-10-23', '2026-10-25')],
    });
    expect(s.overlapping.map((b) => b.faroId)).toEqual(['A']);
    expect(s.freeWindow).toMatchObject({ startDate: '2026-10-26', endDate: '2026-11-01', afterFaroIds: ['A', 'B'] });
  });

  it('addDays vira o mês', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});
