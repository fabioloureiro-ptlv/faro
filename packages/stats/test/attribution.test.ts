import { describe, expect, it } from 'vitest';
import { attributeEvents, buildExposures, contaminationSummary } from '../src/index.ts';

const imps = [
  { userKey: 'u1', variantKey: 'A', at: '2026-09-01T10:00:00Z', platform: 'android' as const },
  { userKey: 'u1', variantKey: 'A', at: '2026-09-03T10:00:00Z', platform: 'ios' as const },
  { userKey: 'u2', variantKey: 'B', at: '2026-09-02T10:00:00Z', platform: 'ios' as const },
  { userKey: 'u2', variantKey: 'A', at: '2026-09-05T10:00:00Z', platform: 'ios' as const },
  { userKey: 'u3', variantKey: 'B', at: '2026-08-20T10:00:00Z', platform: 'site' as const },
  { userKey: 'u3', variantKey: 'B', at: '2026-09-10T10:00:00Z', platform: 'site' as const }
];

describe('camada de exposição', () => {
  it('uma linha por usuário, com a plataforma e a data da primeira exposição', () => {
    const ex = buildExposures(imps);
    expect(ex).toHaveLength(3);
    const u1 = ex.find((e) => e.userKey === 'u1')!;
    expect(u1.firstExposureAt).toBe('2026-09-01T10:00:00Z');
    expect(u1.platform).toBe('android');
    expect(u1.contaminated).toBe(false);
  });
  it('usuário que viu duas variantes é marcado como contaminado', () => {
    const ex = buildExposures(imps);
    const u2 = ex.find((e) => e.userKey === 'u2')!;
    expect(u2.contaminated).toBe(true);
    expect(u2.variantsSeen.sort()).toEqual(['A', 'B']);
    expect(contaminationSummary(ex)).toEqual({ users: 1, share: 1 / 3 });
  });
  it('janela de leitura ignora impressões fora do intervalo', () => {
    const ex = buildExposures(imps, { start: '2026-08-31', end: '2026-09-30' });
    expect(ex.find((e) => e.userKey === 'u3')!.firstExposureAt).toBe('2026-09-10T10:00:00Z');
  });
  it('eventos antes da exposição não contam e contaminados são excluídos', () => {
    const ex = buildExposures(imps);
    const events = [
      { userKey: 'u1', at: '2026-08-31T23:00:00Z', value: 100 }, // antes da exposição
      { userKey: 'u1', at: '2026-09-02T09:00:00Z', value: 50 },
      { userKey: 'u2', at: '2026-09-06T09:00:00Z', value: 70 },  // contaminado
      { userKey: 'u9', at: '2026-09-06T09:00:00Z', value: 10 }   // não exposto
    ];
    const kept = attributeEvents(ex, events);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ userKey: 'u1', value: 50, variantKey: 'A', platform: 'android' });
    expect(attributeEvents(ex, events, undefined, { excludeContaminated: false })).toHaveLength(2);
    expect(attributeEvents(ex, events, { start: '2026-09-03' })).toHaveLength(0);
  });
});
