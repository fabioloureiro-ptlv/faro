// Cálculo de amostra (CFG-07). α = 5% bicaudal, poder = 80%.
import type { MetricDefinition } from '@faro/contracts';

export const Z_ALPHA = 1.959963984540054; // z(1 − 0,05/2)
export const Z_POWER = 0.8416212335729143; // z(0,80)
const Z2 = (Z_ALPHA + Z_POWER) ** 2;

/** n por grupo para proporção: (zα/2 + zβ)² · 2p(1−p) / (p·MDE)². */
export function sampleSizeProportion(p: number, mde: number): number | null {
  if (!(p > 0 && p < 1) || !(mde > 0)) return null;
  return Math.ceil((Z2 * 2 * p * (1 - p)) / (p * mde) ** 2);
}

/** n por grupo para média: (zα/2 + zβ)² · 2·cv² / MDE². */
export function sampleSizeMean(cv: number, mde: number): number | null {
  if (!(cv > 0) || !(mde > 0)) return null;
  return Math.ceil((Z2 * 2 * cv ** 2) / mde ** 2);
}

export interface SampleSizeInput {
  metric: Pick<MetricDefinition, 'kind' | 'baseline' | 'cv'>;
  mdeRelative: number;
  /** Proporção: taxa (0–1). Média/razão: coeficiente de variação. Sobrepõe o catálogo. */
  baselineOverride?: number;
}

/** Linha de base efetiva: taxa para proporção, cv para média/razão. */
export function effectiveBaseline(input: Omit<SampleSizeInput, 'mdeRelative'>): number | undefined {
  const { metric, baselineOverride } = input;
  if (baselineOverride != null && baselineOverride > 0) return baselineOverride;
  return metric.kind === 'proportion' ? metric.baseline : metric.cv;
}

export function sampleSizePerGroup(input: SampleSizeInput): number | null {
  const base = effectiveBaseline(input);
  if (base == null) return null;
  if (input.metric.kind === 'proportion') return sampleSizeProportion(base, input.mdeRelative);
  // DECISAO-PENDENTE: kind 'ratio' tratado como média com cv (aproximação pelo método delta).
  return sampleSizeMean(base, input.mdeRelative);
}
