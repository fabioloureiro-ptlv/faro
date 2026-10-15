// Sugestão de efeito mínimo detectável pela base histórica (ajuste de produto 15/10):
// olha testes parecidos (mesma NORTE; mais parecidos se dividem página, BU e plataforma)
// e propõe como MDE o efeito típico já observado — o teste é dimensionado para enxergar
// o que testes como ele costumam mover.
import type { Bu, Platform, SignificanceLabel } from '@faro/contracts';

export interface HistoricalEffect {
  faroId: string;
  name: string;
  metricId: string;
  /** Delta relativo da variante vs controle (ex.: 0.04 = +4%). */
  deltaRelative: number;
  label?: SignificanceLabel;
  pages: string[];
  bu: Bu;
  platforms: Platform[];
}

export interface MdeSuggestionInput {
  metricId: string;
  pages: string[];
  bu: Bu;
  platforms: Platform[];
  history: HistoricalEffect[];
}

export interface MdeSuggestionBasis extends HistoricalEffect {
  similarity: number;
}

export interface MdeSuggestion {
  metricId: string;
  /** MDE sugerido (relativo, ex.: 0.045), ou null sem histórico para a métrica. */
  suggested: number | null;
  /** Mediana do |efeito| observado, antes do arredondamento. */
  medianAbsEffect: number | null;
  sampleCount: number;
  improved: number;
  worsened: number;
  /** Até MAX_BASIS testes, mais parecidos primeiro. */
  basis: MdeSuggestionBasis[];
}

export const MDE_MIN = 0.01;
export const MDE_MAX = 0.3;
export const MDE_STEP = 0.005; // meio ponto percentual
const MAX_BASIS = 5;

/** Mesma métrica é pré-requisito; página, BU e plataforma em comum aumentam a semelhança. */
export function similarity(target: Omit<MdeSuggestionInput, 'history'>, h: HistoricalEffect): number {
  let s = 1;
  if (h.pages.some((p) => target.pages.includes(p))) s += 1;
  if (h.bu === target.bu) s += 1;
  if (h.platforms.some((p) => target.platforms.includes(p))) s += 0.5;
  return s;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Arredonda para MDE_STEP e limita ao intervalo do slider. */
export function roundMde(x: number): number {
  const r = Math.round(x / MDE_STEP) * MDE_STEP;
  return Math.min(MDE_MAX, Math.max(MDE_MIN, Math.round(r * 1000) / 1000));
}

export function suggestMde(input: MdeSuggestionInput): MdeSuggestion {
  const same = input.history.filter((h) => h.metricId === input.metricId && Number.isFinite(h.deltaRelative));
  const basis = same
    .map((h) => ({ ...h, similarity: similarity(input, h) }))
    .sort((a, b) => b.similarity - a.similarity || Math.abs(b.deltaRelative) - Math.abs(a.deltaRelative))
    .slice(0, MAX_BASIS);
  const med = median(same.map((h) => Math.abs(h.deltaRelative)));
  return {
    metricId: input.metricId,
    suggested: med == null ? null : roundMde(med),
    medianAbsEffect: med,
    sampleCount: same.length,
    improved: same.filter((h) => h.deltaRelative > 0).length,
    worsened: same.filter((h) => h.deltaRelative < 0).length,
    basis,
  };
}
