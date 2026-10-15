/** Correções para várias comparações (roadmap v3): Holm nas guardas, Benjamini-Hochberg nas exploratórias, Šidák/Dunnett-aprox. para várias variantes. */

export function holm(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(m);
  let running = 0;
  order.forEach(([p, i], rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    out[i] = running;
  });
  return out;
}

export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(m);
  let running = 1;
  for (let rank = m - 1; rank >= 0; rank--) {
    const [p, i] = order[rank]!;
    running = Math.min(running, Math.min(1, (m / (rank + 1)) * p));
    out[i] = running;
  }
  return out;
}

/**
 * Aproximação de Dunnett por Šidák para k variantes contra um controle: p_adj = 1 − (1 − p)^k.
 * Conservadora (ignora a correlação entre comparações). Documentado em METODO.md.
 */
export function dunnettSidak(pValue: number, variantsCount: number): number {
  if (variantsCount <= 1) return pValue;
  return 1 - Math.pow(1 - pValue, variantsCount);
}
