import type { MetricKind, MetricDirection } from '@faro/contracts';
import { twoProportionZ } from './proportions.ts';
import { meanDelta, ratioDelta } from './means.ts';
import type { Arm, Comparison, EvaluateOptions, MeanArm, ProportionArm, RatioArm } from './types.ts';

export interface EvaluateInput {
  kind: MetricKind;
  direction: MetricDirection;
  control: Arm;
  variant: Arm;
  options?: EvaluateOptions;
}

export function isProportionArm(a: Arm): a is ProportionArm { return 'successes' in a; }
export function isRatioArm(a: Arm): a is RatioArm { return 'numeratorMean' in a; }
export function isMeanArm(a: Arm): a is MeanArm { return 'mean' in a && !('numeratorMean' in a); }

/** Ponto único de avaliação de uma métrica variante × controle (MET-06). */
export function evaluateMetric(input: EvaluateInput): Comparison {
  const { kind, direction, control, variant, options } = input;
  if (kind === 'proportion') {
    if (!isProportionArm(control) || !isProportionArm(variant)) throw new Error('proportion exige ProportionArm');
    return twoProportionZ(control, variant, direction, options);
  }
  if (kind === 'mean') {
    if (!isMeanArm(control) || !isMeanArm(variant)) throw new Error('mean exige MeanArm');
    return meanDelta(control, variant, direction, options);
  }
  if (!isRatioArm(control) || !isRatioArm(variant)) throw new Error('ratio exige RatioArm');
  return ratioDelta(control, variant, direction, options);
}

/** Valor pontual de um braço, na unidade da métrica. */
export function armValue(kind: MetricKind, arm: Arm): number {
  if (kind === 'proportion' && isProportionArm(arm)) return arm.n > 0 ? arm.successes / arm.n : NaN;
  if (kind === 'mean' && isMeanArm(arm)) return arm.mean;
  if (kind === 'ratio' && isRatioArm(arm)) return arm.numeratorMean / arm.denominatorMean;
  throw new Error(`braço incompatível com kind=${kind}`);
}
