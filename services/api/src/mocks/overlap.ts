// MOCK da frente 3: regras de sobreposição do protótipo.
import type { Experiment, OverlapDecision } from '@faro/contracts';
import type { OverlapPort } from '../ports.ts';
import { fx } from './fixtures.ts';

const ACTIVE: Experiment['status'][] = ['pronto_para_configurar', 'configurado_no_dy', 'rodando', 'decidido'];
const SENSITIVE_PAGES = ['carrinho', 'checkout'];

function audienceIntersection(a: Experiment, b: Experiment): number {
  const sa = a.audience.estimatedShare ?? 1;
  const sb = b.audience.estimatedShare ?? 1;
  if (sa >= 1) return sb;
  if (sb >= 1) return sa;
  if (a.audience.description.trim().toLowerCase() === b.audience.description.trim().toLowerCase()) return Math.min(sa, sb);
  return sa * sb;
}

export function overlapBetween(a: Experiment, b: Experiment): OverlapDecision | null {
  const A = a.allocation;
  const B = b.allocation;
  if (!A.startDate || !A.endDate || !B.startDate || !B.endDate) return null;
  if (A.endDate < B.startDate || B.endDate < A.startDate) return null;
  const pages = A.pages.filter((p) => B.pages.includes(p));
  const plats = A.platforms.filter((p) => B.platforms.includes(p));
  if (!pages.length || !plats.length) return null;
  const seg = audienceIntersection(a, b);
  if (!seg) return null;
  const share = plats.reduce((s, p) => s + (fx.pages.platformShare[p] ?? 0), 0);
  const maxDaily = Math.max(...pages.map((id) => fx.pages.pages.find((p) => p.id === id)?.dailyUsers ?? 0));
  const daily = Math.round(maxDaily * share * seg * (A.trafficPercent / 100) * (B.trafficPercent / 100));
  let severity: OverlapDecision['severity'] = 'medio';
  if ((a.design.primaryMetricId && a.design.primaryMetricId === b.design.primaryMetricId) || pages.some((p) => SENSITIVE_PAGES.includes(p)))
    severity = 'alto';
  else if (daily < 2000) severity = 'baixo';
  return { otherFaroId: b.faroId, severity, estimatedDailyUsers: daily };
}

export function mockOverlap(): OverlapPort {
  return {
    async listOverlaps(exp, others) {
      return others
        .filter((o) => o.faroId !== exp.faroId && ACTIVE.includes(o.status))
        .map((o) => overlapBetween(exp, o))
        .filter((o): o is OverlapDecision => o !== null);
    },
  };
}
