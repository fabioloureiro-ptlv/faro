import { EXPERIMENT_STATUSES } from '@faro/contracts';
import type { GovernanceAlert, OverlapDecision } from '@faro/contracts';
import type { PainelRow, SortDir, SortKey } from './types';

const OVERLAP_RANK: Record<OverlapDecision['severity'], number> = { baixo: 1, medio: 2, alto: 3 };
const ALERT_RANK: Record<GovernanceAlert['severity'], number> = { info: 1, atencao: 2, critico: 3 };

export function worstOverlap(row: PainelRow): OverlapDecision['severity'] | undefined {
  let worst: OverlapDecision['severity'] | undefined;
  for (const o of row.experiment.overlap ?? []) {
    if (!worst || OVERLAP_RANK[o.severity] > OVERLAP_RANK[worst]) worst = o.severity;
  }
  return worst;
}

export function worstAlert(row: PainelRow): GovernanceAlert['severity'] | undefined {
  let worst: GovernanceAlert['severity'] | undefined;
  for (const a of row.alerts) if (!worst || ALERT_RANK[a.severity] > ALERT_RANK[worst]) worst = a.severity;
  return worst;
}

type Key = string | number | undefined;

// Severidade pesa mais que contagem: 1 crítico > 3 de atenção.
const KEY_OF: Record<SortKey, (r: PainelRow) => Key> = {
  nome: (r) => r.experiment.name.toLocaleLowerCase('pt-BR'),
  status: (r) => EXPERIMENT_STATUSES.indexOf(r.experiment.status),
  onde: (r) => r.experiment.allocation.pages.join(',') + '|' + r.experiment.allocation.platforms.join(','),
  publico: (r) => r.experiment.audience.description.toLocaleLowerCase('pt-BR'),
  norte: (r) => r.norte?.probBetter,
  periodo: (r) => r.experiment.allocation.startDate,
  sobreposicao: (r) => {
    const w = worstOverlap(r);
    return w ? OVERLAP_RANK[w] * 1000 + (r.experiment.overlap?.length ?? 0) : 0;
  },
  alertas: (r) => {
    const w = worstAlert(r);
    return w ? ALERT_RANK[w] * 1000 + r.alerts.length : 0;
  },
};

function compareKeys(a: Key, b: Key): number {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pt-BR');
}

/** Ordena sem mutar. Valores ausentes (ex.: teste sem leitura) vão sempre para o fim. */
export function sortRows(rows: readonly PainelRow[], key: SortKey, dir: SortDir): PainelRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const keyOf = KEY_OF[key];
  return rows
    .map((row) => ({ row, k: keyOf(row) }))
    .sort((x, y) => {
      if (x.k === undefined && y.k !== undefined) return 1;
      if (y.k === undefined && x.k !== undefined) return -1;
      return sign * compareKeys(x.k, y.k) || x.row.experiment.faroId.localeCompare(y.row.experiment.faroId);
    })
    .map((x) => x.row);
}
