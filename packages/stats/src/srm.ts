import type { SrmResult } from '@faro/contracts';
import { chiSquareSurvival } from './normal.ts';

export const SRM_ALERT_P = 0.001;

/**
 * Sample ratio mismatch (MET-08): qui-quadrado de aderência dos expostos por variante ao split planejado.
 * Alerta com p < 0,001 (contexto, seção 6).
 */
export function srm(observed: number[], plannedShares: number[], options: { unstableSplitDays?: number } = {}): SrmResult {
  if (observed.length !== plannedShares.length || observed.length < 2) throw new Error('observed e plannedShares precisam do mesmo tamanho (≥ 2)');
  const shareSum = plannedShares.reduce((s, x) => s + x, 0);
  const total = observed.reduce((s, x) => s + x, 0);
  const observedShares = observed.map((x) => (total > 0 ? x / total : 0));
  let chi = 0;
  for (let i = 0; i < observed.length; i++) {
    const expected = total * (plannedShares[i]! / shareSum);
    if (expected > 0) chi += (observed[i]! - expected) ** 2 / expected;
  }
  const df = observed.length - 1;
  const pValue = total > 0 ? chiSquareSurvival(chi, df) : 1;
  return {
    chiSquare: chi, degreesOfFreedom: df, pValue, alert: total > 0 && pValue < SRM_ALERT_P,
    plannedShares: plannedShares.map((x) => x / shareSum), observedShares,
    ...(options.unstableSplitDays != null ? { unstableSplitDays: options.unstableSplitDays } : {})
  };
}
