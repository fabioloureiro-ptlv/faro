import { describe, expect, it } from 'vitest';
import { AudienceRuleSchema, type Audience, type AudienceRule, type Experiment } from '@faro/contracts';
import audiences from '@faro/contracts/fixtures/audiences.json' with { type: 'json' };
import nexus from '@faro/contracts/fixtures/nexus.json' with { type: 'json' };
import { audienceIntersection, estimateEligibleDaily, overlapBetween } from './engine.ts';
import { audienceRuleToSql } from './rule-sql.ts';

const atalho = (id: string, over: Partial<Audience> = {}): Audience => {
  const s = (audiences as { id: string; name: string; share: number }[]).find((a) => a.id === id)!;
  return { description: s.name, source: 'atalho', estimatedShare: s.share, ...over };
};

const NEXUS = nexus.experiment as unknown as Experiment;

const draft = (over: Partial<Experiment['allocation']> = {}, audience: Audience = atalho('todos')): Experiment => ({
  ...NEXUS,
  faroId: 'FARO-2026-0999',
  audience,
  allocation: { ...NEXUS.allocation, startDate: '2026-10-20', endDate: '2026-11-20', ...over },
});

describe('interseção de públicos (SEG-10)', () => {
  it('disjuntos declarados não se cruzam: novos × recorrentes', () => {
    expect(audienceIntersection(atalho('novos'), atalho('recorrentes'))).toEqual({ share: 0, estimated: false });
    expect(audienceIntersection(atalho('repet'), atalho('naorepet')).share).toBe(0);
  });

  it('mesmo público usa a menor participação; "todos" usa a do outro', () => {
    expect(audienceIntersection(atalho('caes'), atalho('caes'))).toEqual({ share: 0.68, estimated: false });
    expect(audienceIntersection(atalho('todos'), atalho('tapete'))).toEqual({ share: 0.09, estimated: false });
  });

  it('públicos independentes usam o produto, sinalizado como estimativa', () => {
    const r = audienceIntersection(atalho('caes'), atalho('tapete'));
    expect(r.share).toBeCloseTo(0.68 * 0.09, 5);
    expect(r.estimated).toBe(true);
  });
});

describe('sobreposição planejada (SEG-09/11/13)', () => {
  it('sem cruzamento de datas, páginas ou plataformas não há conflito', () => {
    const base = draft();
    expect(overlapBetween(draft({ endDate: '2026-10-25' }), { ...base, allocation: { ...base.allocation, startDate: '2026-11-01' } })).toBeNull();
    expect(overlapBetween(draft({ pages: ['busca'] }), draft({ pages: ['home'] }))).toBeNull();
    expect(overlapBetween(draft({ platforms: ['site'] }), draft({ platforms: ['android'] }))).toBeNull();
  });

  it('mesma página de checkout é severidade alta', () => {
    const o = overlapBetween(draft({ pages: ['checkout'] }), { ...draft({ pages: ['checkout'] }), faroId: 'FARO-2026-0998' });
    expect(o?.severity).toBe('alto');
  });

  it('mesmo grupo de exclusão mútua não gera conflito', () => {
    const a = draft({ exclusionGroupId: 'home-app' });
    const b = { ...draft({ exclusionGroupId: 'home-app' }), faroId: 'FARO-2026-0997' };
    expect(overlapBetween(a, b)).toBeNull();
  });

  it('públicos disjuntos não geram conflito mesmo na mesma página', () => {
    const a = draft({}, atalho('novos'));
    const b = { ...draft({}, atalho('recorrentes')), faroId: 'FARO-2026-0996' };
    expect(overlapBetween(a, b)).toBeNull();
  });
});

describe('elegíveis por dia (SEG-06)', () => {
  it('multiplica tráfego da página, plataforma, público e % de tráfego', () => {
    const e = draft({ pages: ['home'], platforms: ['site'], trafficPercent: 50 }, atalho('caes'));
    const n = estimateEligibleDaily(e.allocation, e.audience);
    expect(n).toBeGreaterThan(0);
    const dobro = estimateEligibleDaily({ ...e.allocation, trafficPercent: 100 }, e.audience);
    expect(dobro).toBe(n * 2);
  });
});

describe('regra → SQL (SEG-03/05)', () => {
  const rule: AudienceRule = AudienceRuleSchema.parse({
    op: 'and',
    conditions: [
      { type: 'comprou', dimension: 'categoria', values: ['cachorro/brinquedos'], windowDays: 365 },
      { type: 'propriedade', key: 'especie_pet', op: 'eq', values: ['cachorro'] },
    ],
  });

  it('gera 1 linha por cliente com cuid e janelas sempre em BETWEEN fechado', () => {
    const sql = audienceRuleToSql(rule);
    expect(sql).toContain('SELECT chv_cliente, public_id AS cuid');
    expect(sql).toContain('BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) AND CURRENT_DATE()');
    expect(sql).not.toMatch(/refdate\s*<=/);
    expect(sql).toContain("pet_cachorro = 'Sim'");
  });

  it('propriedade sem fonte mapeada falha com instrução de pedido', () => {
    const r: AudienceRule = { op: 'and', conditions: [{ type: 'propriedade', key: 'regiao', op: 'eq', values: ['sp'] }] };
    expect(() => audienceRuleToSql(r)).toThrow(/PEDIDOS/);
  });

  it('todas as regras dos atalhos da fixture compilam', () => {
    for (const a of audiences as { rule?: unknown }[]) {
      if (!a.rule) continue;
      expect(() => audienceRuleToSql(AudienceRuleSchema.parse(a.rule))).not.toThrow();
    }
  });
});
