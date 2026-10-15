/**
 * CUPED: ajuste por covariável pré-experimento (ex.: receita do usuário nos 28 dias antes da exposição).
 * y_adj = y − θ (x − x̄), θ = cov(x, y) / var(x). Reduz a variância sem viés no delta.
 * Opcional por métrica; o roadmap v3 usa 28 dias.
 */
export interface CupedResult { theta: number; adjusted: number[]; varianceReduction: number }

function mean(v: number[]): number { return v.reduce((s, x) => s + x, 0) / v.length; }

export function cupedAdjust(y: number[], x: number[]): CupedResult {
  if (y.length !== x.length || y.length < 2) throw new Error('y e x precisam do mesmo tamanho (≥ 2)');
  const my = mean(y), mx = mean(x);
  let cov = 0, varX = 0, varY = 0;
  for (let i = 0; i < y.length; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    varX += (x[i] - mx) ** 2;
    varY += (y[i] - my) ** 2;
  }
  const theta = varX > 0 ? cov / varX : 0;
  const adjusted = y.map((yi, i) => yi - theta * (x[i] - mx));
  const mAdj = mean(adjusted);
  const varAdj = adjusted.reduce((s, a) => s + (a - mAdj) ** 2, 0);
  return { theta, adjusted, varianceReduction: varY > 0 ? 1 - varAdj / varY : 0 };
}
