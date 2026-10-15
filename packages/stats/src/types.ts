import type { MetricDirection, MetricKind, SignificanceLabel } from '@faro/contracts';

export type { MetricDirection, MetricKind, SignificanceLabel };

/** Braço de métrica de proporção (conversão): sucessos sobre n unidades (usuários ou sessões). */
export interface ProportionArm { successes: number; n: number }

/** Braço de métrica de média (receita por usuário): média e variância amostral dos valores por unidade. */
export interface MeanArm { mean: number; variance: number; n: number }

/** Braço de métrica de razão (ticket médio = receita ÷ compradores): médias por unidade do numerador e do denominador. */
export interface RatioArm {
  numeratorMean: number;
  denominatorMean: number;
  numeratorVariance: number;
  denominatorVariance: number;
  covariance: number;
  n: number;
}

export type Arm = ProportionArm | MeanArm | RatioArm;

export interface Comparison {
  controlValue: number;
  variantValue: number;
  deltaAbs: number;
  /** (variante − controle) ÷ controle. */
  deltaRelative: number;
  /** Erro padrão do delta absoluto. */
  se: number;
  z: number;
  /** p bilateral. */
  pValue: number;
  /** IC 95% do delta relativo. */
  ci95: { lower: number; upper: number };
  /** P(variante melhor que controle), já invertida para lower_better. */
  probBetter: number;
  label: SignificanceLabel;
}

export interface EvaluateOptions {
  /** Método do IC para proporções: Wald (padrão do contexto) ou Agresti-Caffo (roadmap v3). */
  proportionCi?: 'wald' | 'agresti_caffo';
  /** Nível do IC. Padrão 0,95. */
  confidence?: number;
}
