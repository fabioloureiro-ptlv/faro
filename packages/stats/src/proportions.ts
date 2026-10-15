import type { MetricDirection } from '@faro/contracts';
import { phi, phiInv } from './normal.ts';
import { probBetter } from './probBetter.ts';
import { significanceLabel } from './labels.ts';
import type { Comparison, EvaluateOptions, ProportionArm } from './types.ts';

/**
 * Teste z de duas proporções (MET-06). Erro padrão pooled para o teste e não pooled para o IC.
 * `agresti_caffo` adiciona um sucesso e um fracasso a cada braço no IC (roadmap v3).
 */
export function twoProportionZ(control: ProportionArm, variant: ProportionArm, direction: MetricDirection, options: EvaluateOptions = {}): Comparison {
  const conf = options.confidence ?? 0.95;
  const zq = phiInv(1 - (1 - conf) / 2);
  const pc = control.n > 0 ? control.successes / control.n : NaN;
  const pv = variant.n > 0 ? variant.successes / variant.n : NaN;
  const pooled = (control.successes + variant.successes) / (control.n + variant.n);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / control.n + 1 / variant.n));
  const diff = pv - pc;
  const z = sePooled > 0 ? diff / sePooled : (diff === 0 ? 0 : diff > 0 ? Infinity : -Infinity);
  const pValue = sePooled > 0 ? 2 * (1 - phi(Math.abs(z))) : (diff === 0 ? 1 : 0);

  let ciLow: number, ciHigh: number;
  if (options.proportionCi === 'agresti_caffo') {
    const nc = control.n + 2, nv = variant.n + 2;
    const qc = (control.successes + 1) / nc, qv = (variant.successes + 1) / nv;
    const se = Math.sqrt(qc * (1 - qc) / nc + qv * (1 - qv) / nv);
    const d = qv - qc;
    ciLow = d - zq * se; ciHigh = d + zq * se;
  } else {
    const se = Math.sqrt(pc * (1 - pc) / control.n + pv * (1 - pv) / variant.n);
    ciLow = diff - zq * se; ciHigh = diff + zq * se;
  }
  const rel = (x: number) => (pc > 0 ? x / pc : NaN);
  const pb = probBetter(z, direction);
  return {
    controlValue: pc, variantValue: pv, deltaAbs: diff, deltaRelative: rel(diff), se: sePooled, z, pValue,
    ci95: { lower: rel(ciLow), upper: rel(ciHigh) }, probBetter: pb, label: significanceLabel(pb)
  };
}
