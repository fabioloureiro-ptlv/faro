import type { MetricDirection } from '@faro/contracts';
import { phi, phiInv } from './normal.ts';
import { probBetter } from './probBetter.ts';
import { significanceLabel } from './labels.ts';
import type { Comparison, EvaluateOptions, MeanArm, RatioArm } from './types.ts';

function finish(controlValue: number, variantValue: number, seAbs: number, direction: MetricDirection, conf: number): Comparison {
  const zq = phiInv(1 - (1 - conf) / 2);
  const diff = variantValue - controlValue;
  const z = seAbs > 0 ? diff / seAbs : (diff === 0 ? 0 : diff > 0 ? Infinity : -Infinity);
  const pValue = seAbs > 0 ? 2 * (1 - phi(Math.abs(z))) : (diff === 0 ? 1 : 0);
  const rel = (x: number) => (controlValue !== 0 ? x / Math.abs(controlValue) : NaN);
  const pb = probBetter(z, direction);
  return {
    controlValue, variantValue, deltaAbs: diff, deltaRelative: rel(diff), se: seAbs, z, pValue,
    ci95: { lower: rel(diff - zq * seAbs), upper: rel(diff + zq * seAbs) }, probBetter: pb, label: significanceLabel(pb)
  };
}

/** Diferença de médias com aproximação normal (Welch): var(diff) = s²c/nc + s²v/nv. */
export function meanDelta(control: MeanArm, variant: MeanArm, direction: MetricDirection, options: EvaluateOptions = {}): Comparison {
  const se = Math.sqrt(control.variance / control.n + variant.variance / variant.n);
  return finish(control.mean, variant.mean, se, direction, options.confidence ?? 0.95);
}

/** Variância de uma razão de médias R = X̄/Ȳ pelo delta method. */
export function ratioVariance(arm: RatioArm): number {
  const x = arm.numeratorMean, y = arm.denominatorMean;
  if (y === 0 || arm.n === 0) return NaN;
  const r = x / y;
  return (r * r) * (arm.numeratorVariance / (x * x) + arm.denominatorVariance / (y * y) - 2 * arm.covariance / (x * y)) / arm.n;
}

/** Diferença de razões (ex.: ticket médio = receita ÷ compradores) pelo delta method. */
export function ratioDelta(control: RatioArm, variant: RatioArm, direction: MetricDirection, options: EvaluateOptions = {}): Comparison {
  const rc = control.numeratorMean / control.denominatorMean;
  const rv = variant.numeratorMean / variant.denominatorMean;
  const se = Math.sqrt(ratioVariance(control) + ratioVariance(variant));
  return finish(rc, rv, se, direction, options.confidence ?? 0.95);
}
