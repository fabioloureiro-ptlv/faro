/** Gerador de dados sintéticos por usuário, seedado, para testar o motor e os casos de borda. */
import type { MeanArm, ProportionArm } from './types.ts';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(r: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export type ArmSpec =
  | { kind: 'proportion'; n: number; p: number }
  | { kind: 'mean'; n: number; mean: number; cv: number; zeroShare?: number };

/** Valores por unidade (0/1 para proporção; valor ≥ 0 para média, com massa em zero opcional). */
export function generateArmValues(spec: ArmSpec, seed: number): number[] {
  const r = rng(seed);
  const out = new Array<number>(spec.n);
  if (spec.kind === 'proportion') {
    for (let i = 0; i < spec.n; i++) out[i] = r() < spec.p ? 1 : 0;
    return out;
  }
  const zero = spec.zeroShare ?? 0;
  const condMean = zero < 1 ? spec.mean / (1 - zero) : spec.mean;
  // lognormal com média condMean e cv alvo
  const sigma2 = Math.log(1 + spec.cv * spec.cv);
  const mu = Math.log(condMean) - sigma2 / 2;
  for (let i = 0; i < spec.n; i++) out[i] = r() < zero ? 0 : Math.exp(mu + Math.sqrt(sigma2) * gaussian(r));
  return out;
}

export function summarizeProportion(values: number[]): ProportionArm {
  return { successes: values.reduce((s, x) => s + x, 0), n: values.length };
}

export function summarizeMean(values: number[]): MeanArm {
  const n = values.length;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const variance = n > 1 ? values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, variance, n };
}
