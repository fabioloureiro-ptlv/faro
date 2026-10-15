import type { MetricDirection } from '@faro/contracts';
import { phi } from './normal.ts';

/**
 * P(variante melhor que controle) pela aproximação normal.
 * z = (variante − controle) ÷ erro padrão. Para lower_better a direção é invertida.
 */
export function probBetter(z: number, direction: MetricDirection): number {
  if (Number.isNaN(z)) return 0.5;
  return direction === 'lower_better' ? phi(-z) : phi(z);
}
