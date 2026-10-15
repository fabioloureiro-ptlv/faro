/**
 * Paridade com o visualizador (MET-17), versão provisória: usa só o que o fixture traz (valor e n por braço).
 * Para proporções, o z de duas proporções recomputado deve concordar com probBetter e com o sentido do delta.
 * A paridade completa (0,5% nos valores, deltas pelo método do visualizador) exige o SQL v4 e o export de 13/10.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MetricResult, ResultsResponse } from '@faro/contracts';
import { twoProportionZ } from '../src/index.ts';

const nexus = JSON.parse(readFileSync(fileURLToPath(new URL('../../contracts/fixtures/nexus-results.json', import.meta.url)), 'utf8')) as ResultsResponse;
const PROPORTIONS = ['conversao', 'conversao_carrinho', 'conversao_clube'];

function pair(metricId: string, platform: string): [MetricResult, MetricResult] {
  const rows = nexus.results.filter((r) => r.metricId === metricId && r.platform === platform);
  const c = rows.find((r) => r.variantKey === 'home_antiga')!;
  const v = rows.find((r) => r.variantKey === 'home_nova')!;
  return [c, v];
}

describe('paridade provisória com o Nexus', () => {
  for (const platform of ['all', 'android', 'ios']) {
    for (const metricId of PROPORTIONS) {
      it(`${metricId} · ${platform}: z-test recomputado concorda com o visualizador`, () => {
        const [c, v] = pair(metricId, platform);
        const r = twoProportionZ({ successes: Math.round(c.value! * c.n), n: c.n }, { successes: Math.round(v.value! * v.n), n: v.n }, 'higher_better');
        // delta relativo da razão simples: tolerância folgada por causa do arredondamento de 4 casas no protótipo
        expect(Math.sign(r.deltaRelative)).toBe(Math.sign(v.deltaRelative!));
        expect(Math.abs(r.probBetter - v.probBetter!)).toBeLessThan(0.02);
      });
    }
  }
  it('receita por usuário consolidada: o delta exibido (+108,1%) não é a razão simples (+304%)', () => {
    const [c, v] = pair('receita_por_usuario', 'all');
    const simple = v.value! / c.value! - 1;
    expect(simple).toBeGreaterThan(3);
    expect(v.deltaRelative).toBeCloseTo(1.081, 6);
    // Documentado em PLAN.md (pergunta 2): o visualizador aplica o próprio método (provavelmente CUPED e correção pós-rollout).
  });
});
