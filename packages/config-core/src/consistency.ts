// Checagem de consistência D+1 (CFG-13): planejado no Faro × observado no export do DY.
import type { ConfigDivergence, Experiment, Platform } from '@faro/contracts';
import { variationNames } from './dy-sheet.ts';

export const SPLIT_TOLERANCE_PP = 0.02;

/** Recorte do export do DY para uma campanha num dia. */
export interface DyCampaignSnapshot {
  campaignId: string;
  refdate: string;
  variations: { name: string; users: number }[];
  platforms: Platform[];
}

const pp = (x: number) => `${(Math.round(x * 1000) / 10).toString().replace('.', ',')}%`;

export function checkConsistency(
  exp: Experiment,
  snap: DyCampaignSnapshot,
  tolerance = SPLIT_TOLERANCE_PP,
): ConfigDivergence[] {
  const out: ConfigDivergence[] = [];
  const base = { faroId: exp.faroId, campaignId: snap.campaignId, refdate: snap.refdate };
  const expected = variationNames(exp);
  const observed = snap.variations.map((v) => v.name);

  const missing = expected.filter((n) => !observed.includes(n));
  const extra = observed.filter((n) => !expected.includes(n));
  // Nome trocado: sobra de um lado e falta do outro, pareados em ordem.
  while (missing.length && extra.length) {
    const e = missing.shift()!;
    const o = extra.shift()!;
    out.push({ ...base, kind: 'nome_variacao', expected: e, observed: o, message: `A variação "${o}" no DY deveria se chamar "${e}".` });
  }
  for (const e of missing)
    out.push({ ...base, kind: 'variacao_ausente', expected: e, observed: '—', message: `A variação "${e}" não aparece no DY.` });
  for (const o of extra)
    out.push({ ...base, kind: 'variacao_extra', expected: '—', observed: o, message: `O DY tem uma variação a mais: "${o}".` });

  // Split: só compara quando o número de variações bate (comparação por posição).
  const total = snap.variations.reduce((s, v) => s + v.users, 0);
  if (total > 0 && snap.variations.length === expected.length) {
    snap.variations.forEach((v, i) => {
      const plan = exp.allocation.split[i] ?? 0;
      const obs = v.users / total;
      if (Math.abs(obs - plan) > tolerance)
        out.push({
          ...base,
          kind: 'split',
          expected: `${expected[i]}: ${pp(plan)}`,
          observed: `${v.name}: ${pp(obs)}`,
          message: `Split de "${v.name}" em ${pp(obs)}, planejado ${pp(plan)} (tolerância ±${tolerance * 100} p.p.).`,
        });
    });
  }

  for (const p of exp.allocation.platforms)
    if (!snap.platforms.includes(p))
      out.push({ ...base, kind: 'plataforma_ausente', expected: p, observed: '—', message: `Sem exposições em ${p}, que estava planejada.` });
  for (const p of snap.platforms)
    if (!exp.allocation.platforms.includes(p))
      out.push({ ...base, kind: 'plataforma_extra', expected: '—', observed: p, message: `Há exposições em ${p}, que não estava planejada.` });

  return out;
}
