// Frente 4 — motor estatístico puro (04-unificacao-de-metricas.md, MET-06/08/09).
// A fonte de produção dos resultados é data/models/results/dy_results.sql (que já
// calcula tudo no BigQuery); este pacote dá as mesmas contas para uso no produto:
// rótulos, SRM, MDE e leituras pontuais sobre agregados.
import { labelFor, type SignificanceLabel } from '@faro/contracts';

export { labelFor };

/** Φ(z): normal acumulada (Abramowitz-Stegun 26.2.17, erro < 1e-7). */
export function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

export interface ArmProportion {
  successes: number;
  n: number;
}

export interface ProportionComparison {
  control: number;
  variant: number;
  deltaRelative: number;
  z: number;
  /** P(variante melhor), já invertida para lower_better quando direction = 'lower_better'. */
  probBetter: number;
  label: SignificanceLabel;
}

/**
 * MET-06 — teste z de duas proporções com Agresti-Caffo (+1 sucesso e +1 fracasso
 * por braço), o mesmo ajuste do dy_results.sql.
 */
export function compareProportions(
  control: ArmProportion,
  variant: ArmProportion,
  direction: 'higher_better' | 'lower_better' = 'higher_better',
): ProportionComparison {
  const pc = (control.successes + 1) / (control.n + 2);
  const pv = (variant.successes + 1) / (variant.n + 2);
  const vc = (pc * (1 - pc)) / (control.n + 2);
  const vv = (pv * (1 - pv)) / (variant.n + 2);
  const z = (pv - pc) / Math.sqrt(vc + vv);
  const sg = direction === 'lower_better' ? -1 : 1;
  const probBetter = phi(sg * z);
  return {
    control: control.successes / control.n,
    variant: variant.successes / variant.n,
    deltaRelative: pv / pc - 1,
    z,
    probBetter,
    label: labelFor(probBetter),
  };
}

export interface ArmMean {
  mean: number;
  variance: number; // variância DA MÉDIA (s²/n)
  n: number;
}

/** MET-06 — médias por aproximação normal; probBetter já invertida para lower_better. */
export function compareMeans(
  control: ArmMean,
  variant: ArmMean,
  direction: 'higher_better' | 'lower_better' = 'higher_better',
): ProportionComparison {
  const z = (variant.mean - control.mean) / Math.sqrt(control.variance + variant.variance);
  const sg = direction === 'lower_better' ? -1 : 1;
  const probBetter = phi(sg * z);
  return {
    control: control.mean,
    variant: variant.mean,
    deltaRelative: control.mean !== 0 ? variant.mean / control.mean - 1 : 0,
    z,
    probBetter,
    label: labelFor(probBetter),
  };
}

/**
 * MET-08 — SRM: qui-quadrado contra o split planejado, p pela aproximação de
 * Wilson-Hilferty (a mesma do dy_results.sql). Alerta com p < 0,001.
 */
export function srmPValue(observed: number[], plannedSplit: number[]): number {
  if (observed.length !== plannedSplit.length || observed.length < 2) throw new Error('braços incompatíveis');
  const total = observed.reduce((a, b) => a + b, 0);
  const chi2 = observed.reduce((s, o, i) => {
    const e = total * plannedSplit[i]!;
    return s + (o - e) ** 2 / e;
  }, 0);
  const gl = observed.length - 1;
  const x = (chi2 / gl) ** (1 / 3);
  return 1 - phi((x - (1 - 2 / (9 * gl))) / Math.sqrt(2 / (9 * gl)));
}

/**
 * MET-09 — MDE relativo atual: menor efeito detectável (80% de poder, α = 5%)
 * com a amostra coletada. `se` é o erro padrão do efeito em log-razão.
 */
export function currentMde(seLogRatio: number, zCrit = 1.96): number {
  return (zCrit + 0.84) * seLogRatio;
}

/** CFG-07 (compartilhado com a frente 1): amostra por braço para proporção. */
export function sampleSizeProportion(baseline: number, mdeRelative: number): number {
  const z = 1.96 + 0.84;
  return Math.ceil((z * z * 2 * baseline * (1 - baseline)) / (baseline * mdeRelative) ** 2);
}
