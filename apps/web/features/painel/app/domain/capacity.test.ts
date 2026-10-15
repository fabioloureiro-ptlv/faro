import { describe, expect, it } from 'vitest';
import { ExperimentSchema, PageDefinitionSchema } from '@faro/contracts';
import type { Experiment } from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import pages from '@faro/contracts/fixtures/pages-painel.json';
import { buildCapacity, capacityLevel, committedShare, type CapacityView } from '.';

const exps = experiments.items.map((e) => ExperimentSchema.parse(e));
const catalog = pages.items.map((p) => PageDefinitionSchema.parse(p));
const byId = (id: string) => exps.find((e) => e.faroId === id)!;
const view = buildCapacity(exps, catalog, { today: '2026-10-14' });
const cell = (v: CapacityView, page: string, platform: string) =>
  v.rows.find((r) => r.pageId === page)!.cells.find((c) => c.platform === platform)!;

describe('committedShare', () => {
  const exp = (traffic: number, share: number | undefined, group?: string): Experiment => {
    const base = byId('FARO-2026-0002');
    return {
      ...base,
      audience: { ...base.audience, estimatedShare: share },
      allocation: {
        ...base.allocation,
        trafficPercent: traffic,
        ...(group ? { exclusionGroupId: group } : {}),
      },
    };
  };

  it('sem testes: 0', () => expect(committedShare([])).toBe(0));
  it('um teste: tráfego × público', () => expect(committedShare([exp(50, 0.4)])).toBeCloseTo(0.2));
  it('independentes: 1 − Π(1 − ocupação)', () => {
    expect(committedShare([exp(50, 1), exp(50, 1)])).toBeCloseTo(0.75);
  });
  it('mesmo grupo de exclusão mútua: soma', () => {
    expect(committedShare([exp(50, 1, 'g'), exp(50, 1, 'g')])).toBeCloseTo(1);
    expect(committedShare([exp(30, 1, 'g'), exp(30, 1, 'g'), exp(50, 1)])).toBeCloseTo(1 - 0.4 * 0.5);
  });
  it('público sem estimativa conta como 100%', () =>
    expect(committedShare([exp(40, undefined)])).toBeCloseTo(0.4));
  it('nunca passa de 100%', () => expect(committedShare([exp(80, 1, 'g'), exp(80, 1, 'g')])).toBe(1));
});

describe('capacityLevel', () => {
  it.each([
    [0, 'baixo'],
    [0.49, 'baixo'],
    [0.5, 'medio'],
    [0.8, 'alto'],
    [1, 'alto'],
  ] as const)('%s → %s', (c, l) => expect(capacityLevel(c)).toBe(l));
});

describe('buildCapacity sobre as fixtures (hoje 14/10)', () => {
  it('home no app está 100% comprometida pelo Nexus (decidido e ainda ativo)', () => {
    const c = cell(view, 'home', 'android');
    expect(c.active.map((t) => t.faroId)).toEqual(['FARO-2026-0001', 'FARO-2026-0004']);
    expect(c.committed).toBe(1);
    expect(c).toMatchObject({ level: 'alto', freeDailyUsers: 0 });
  });

  it('home no site está livre, com dois testes chegando', () => {
    const c = cell(view, 'home', 'site');
    expect(c.committed).toBe(0);
    expect(c.freeDailyUsers).toBe(81000);
    expect(c.upcoming.map((u) => u.faroId)).toEqual(['FARO-2026-0005', 'FARO-2026-0008']);
  });

  it('carrinho: 50% em todas as plataformas', () => {
    for (const p of ['site', 'android', 'ios']) {
      expect(cell(view, 'carrinho', p)).toMatchObject({ committed: 0.5, level: 'medio' });
    }
  });

  it('PDP no app: 30% de tráfego × 62% do público', () => {
    expect(cell(view, 'pdp', 'ios').committed).toBeCloseTo(0.186);
  });

  it('encerrado, cancelado e configurado ainda não iniciado não ocupam', () => {
    expect(cell(view, 'checkout', 'site').active).toEqual([]); // 0006 encerrado
    expect(cell(view, 'pdp', 'site').active).toEqual([]); // 0011 cancelado, 0005 começa 21/10
  });

  it('chegando: só design aprovado dentro do horizonte de 30 dias', () => {
    expect(view.horizonEnd).toBe('2026-11-13');
    expect(cell(view, 'busca', 'site').upcoming.map((u) => u.faroId)).toEqual(['FARO-2026-0010']); // 0009 é rascunho
  });

  it('configurado no DY já iniciado ocupa', () => {
    const later = buildCapacity(exps, catalog, { today: '2026-10-22' });
    expect(cell(later, 'pdp', 'site').active.map((t) => t.faroId)).toEqual(['FARO-2026-0005']);
  });

  it('sem usuários por plataforma no catálogo, não estima usuários livres', () => {
    const semPlataforma = catalog.map(({ dailyUsersByPlatform: _d, ...p }) => p);
    expect(
      cell(buildCapacity(exps, semPlataforma, { today: '2026-10-14' }), 'home', 'site').freeDailyUsers,
    ).toBeUndefined();
  });
});
