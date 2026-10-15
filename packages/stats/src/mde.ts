import { phiInv } from './normal.ts';

export interface PowerOptions { power?: number; alpha?: number }
const zs = (o: PowerOptions) => phiInv(1 - (o.alpha ?? 0.05) / 2) + phiInv(o.power ?? 0.8);

/** MDE relativo de uma proporção com n por braço (80% de poder, α = 5%). */
export function mdeProportion(p: number, nPerArm: number, o: PowerOptions = {}): number | null {
  if (!(p > 0) || !(p < 1) || !(nPerArm > 0)) return null;
  return zs(o) * Math.sqrt(2 * p * (1 - p) / nPerArm) / p;
}

/** MDE relativo de uma média com coeficiente de variação cv (= desvio ÷ média) e n por braço. */
export function mdeMean(cv: number, nPerArm: number, o: PowerOptions = {}): number | null {
  if (!(cv > 0) || !(nPerArm > 0)) return null;
  return zs(o) * cv * Math.sqrt(2 / nPerArm);
}

/** Amostra por braço para detectar um efeito relativo `mdeRelative` em uma proporção. */
export function sampleSizeProportion(p: number, mdeRelative: number, o: PowerOptions = {}): number {
  const d = p * mdeRelative;
  return Math.ceil(zs(o) ** 2 * 2 * p * (1 - p) / (d * d));
}

/** Amostra por braço para detectar um efeito relativo `mdeRelative` em uma média com cv. */
export function sampleSizeMean(cv: number, mdeRelative: number, o: PowerOptions = {}): number {
  return Math.ceil(zs(o) ** 2 * 2 * cv * cv / (mdeRelative * mdeRelative));
}
