import type { SignificanceLabel } from '@faro/contracts';

/** Limiares do contexto geral (seção 6). */
export const LABEL_THRESHOLDS = { confirmed: 0.95, trendUp: 0.8, trendDown: 0.2, dropped: 0.05 } as const;

/**
 * Rótulo de significância a partir de P(variante melhor).
 * ≥ 95%: melhora confirmada · ≤ 5%: queda confirmada · 80–95%: tendência de melhora · 5–20%: tendência de queda · demais: sem tendência.
 */
export function significanceLabel(probBetter: number): SignificanceLabel {
  if (!Number.isFinite(probBetter)) return 'sem_tendencia';
  if (probBetter >= LABEL_THRESHOLDS.confirmed) return 'melhora_confirmada';
  if (probBetter <= LABEL_THRESHOLDS.dropped) return 'queda_confirmada';
  if (probBetter >= LABEL_THRESHOLDS.trendUp) return 'tendencia_de_melhora';
  if (probBetter <= LABEL_THRESHOLDS.trendDown) return 'tendencia_de_queda';
  return 'sem_tendencia';
}

export const LABEL_TEXT: Record<SignificanceLabel, string> = {
  melhora_confirmada: 'melhora confirmada',
  tendencia_de_melhora: 'tendência de melhora',
  sem_tendencia: 'sem tendência',
  tendencia_de_queda: 'tendência de queda',
  queda_confirmada: 'queda confirmada'
};
