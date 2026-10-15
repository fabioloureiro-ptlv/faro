import { describe, expect, it } from 'vitest';
import { srm } from '../src/index.ts';

describe('SRM (qui-quadrado sobre o split planejado)', () => {
  it('split 50/50 equilibrado não alerta', () => {
    const r = srm([50120, 49880], [0.5, 0.5]);
    expect(r.pValue).toBeGreaterThan(0.1);
    expect(r.alert).toBe(false);
    expect(r.observedShares[0]).toBeCloseTo(0.5012, 4);
  });
  it('30.520 × 28.790 em um 50/50 alerta (p < 0,001)', () => {
    const r = srm([30520, 28790], [0.5, 0.5]);
    expect(r.chiSquare).toBeCloseTo(50.46, 1);
    expect(r.pValue).toBeLessThan(0.001);
    expect(r.alert).toBe(true);
  });
  it('Nexus 2% × 98%: 21.379 × 1.100.094 observados contra o planejado', () => {
    const r = srm([21379, 1100094], [0.02, 0.98]);
    expect(r.degreesOfFreedom).toBe(1);
    expect(r.plannedShares).toEqual([0.02, 0.98]);
    expect(r.observedShares[0]).toBeCloseTo(0.0191, 4);
    // 1,91% observado contra 2% planejado com 1,1 milhão de usuários é um desvio detectável: o SRM alerta.
    expect(r.alert).toBe(true);
  });
  it('aceita três braços e normaliza shares em percentual', () => {
    const r = srm([1000, 1010, 990], [33.3, 33.3, 33.4]);
    expect(r.degreesOfFreedom).toBe(2);
    expect(r.alert).toBe(false);
  });
  it('rejeita tamanhos diferentes', () => expect(() => srm([1, 2], [1])).toThrow());
});
