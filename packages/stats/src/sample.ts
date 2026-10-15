import type { SampleProgress } from '@faro/contracts';
import { LABEL_THRESHOLDS } from './labels.ts';

/**
 * Progresso da amostra planejada para a NORTE e alerta de significância antes da amostra (MET-10).
 */
export function sampleProgress(input: { requiredPerArm: number; nPerArm: number[]; primaryProbBetter?: number }): SampleProgress {
  const minPerArm = input.nPerArm.length ? Math.min(...input.nPerArm) : 0;
  const progress = input.requiredPerArm > 0 ? Math.min(1, minPerArm / input.requiredPerArm) : 0;
  const p = input.primaryProbBetter;
  const significant = p != null && (p >= LABEL_THRESHOLDS.confirmed || p <= LABEL_THRESHOLDS.dropped);
  return { requiredPerArm: input.requiredPerArm, minPerArm, progress, earlySignificanceAlert: significant && progress < 1 };
}
