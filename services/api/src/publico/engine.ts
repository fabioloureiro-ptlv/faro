// Frente 3 — público e sobreposição (03-segmentacao-e-sobreposicao.md).
// Implementa as portas AudiencePort e OverlapPort que a frente 1 consumia em mock:
// catálogo de páginas, atalhos (dados, não código — SEG-02), elegíveis por dia
// (SEG-06) e o motor de sobreposição planejada (SEG-09 a SEG-12).
import type { Allocation, Audience, AudienceShortcut, Experiment, OverlapDecision } from '@faro/contracts';
import type { AudiencePort, OverlapPort } from '../ports.ts';
import { fx } from '../mocks/fixtures.ts';
import { allShortcuts } from './custom.ts';

const ACTIVE: Experiment['status'][] = ['pronto_para_configurar', 'configurado_no_dy', 'rodando', 'decidido'];
const SENSITIVE_PAGES = ['carrinho', 'checkout'];
/** SEG-11 (limiares configuráveis). */
export const HIGH_SHARE_THRESHOLD = 0.2;
export const LOW_DAILY_THRESHOLD = 2000;
export const LOW_SHARE_THRESHOLD = 0.05;

// Fixture + segmentos aprovados pela tela /segmento (custom.ts).
const shortcuts = (): AudienceShortcut[] => allShortcuts();

function shortcutOf(a: Audience): AudienceShortcut | undefined {
  if (a.source !== 'atalho') return undefined;
  const text = a.description.trim().toLowerCase();
  return shortcuts().find((s) => s.name.toLowerCase() === text || s.id === text);
}

/**
 * SEG-10 — interseção de públicos como fração da base:
 * disjuntos declarados → 0; mesmo público → menor participação; "todos" → a do outro;
 * demais → produto das participações (independência, sinalizada como estimativa).
 */
export function audienceIntersection(a: Audience, b: Audience): { share: number; estimated: boolean } {
  const sa = a.estimatedShare ?? 1;
  const sb = b.estimatedShare ?? 1;
  const ka = shortcutOf(a);
  const kb = shortcutOf(b);
  if (ka && kb) {
    if (ka.disjointWith?.includes(kb.id) || kb.disjointWith?.includes(ka.id)) return { share: 0, estimated: false };
    if (ka.id === kb.id) return { share: Math.min(sa, sb), estimated: false };
  }
  if (sa >= 1) return { share: sb, estimated: false };
  if (sb >= 1) return { share: sa, estimated: false };
  if (a.description.trim().toLowerCase() === b.description.trim().toLowerCase())
    return { share: Math.min(sa, sb), estimated: false };
  return { share: sa * sb, estimated: true };
}

/** SEG-09/11: sobreposição entre dois experimentos, ou null quando não se cruzam. */
export function overlapBetween(a: Experiment, b: Experiment): OverlapDecision | null {
  const A = a.allocation;
  const B = b.allocation;
  if (!A.startDate || !A.endDate || !B.startDate || !B.endDate) return null;
  if (A.endDate < B.startDate || B.endDate < A.startDate) return null;
  // Exclusão mútua declarada (SEG-13): mesmo grupo = sem sobreposição por construção.
  if (A.exclusionGroupId && A.exclusionGroupId === B.exclusionGroupId) return null;
  const pages = A.pages.filter((p) => B.pages.includes(p));
  const plats = A.platforms.filter((p) => B.platforms.includes(p));
  if (!pages.length || !plats.length) return null;

  const seg = audienceIntersection(a.audience, b.audience);
  if (!seg.share) return null;

  const platShare = plats.reduce((s, p) => s + (fx.pages.platformShare[p] ?? 0), 0);
  const maxDaily = Math.max(...pages.map((id) => fx.pages.pages.find((p) => p.id === id)?.dailyUsers ?? 0));
  const daily = Math.round(maxDaily * platShare * seg.share * (A.trafficPercent / 100) * (B.trafficPercent / 100));

  // % do público de cada teste atingido pelo cruzamento (SEG-09/11).
  const eligibleA = estimateEligibleDaily(A, a.audience);
  const eligibleB = estimateEligibleDaily(B, b.audience);
  const shareOfA = eligibleA ? daily / eligibleA : 0;
  const shareOfB = eligibleB ? daily / eligibleB : 0;

  let severity: OverlapDecision['severity'] = 'medio';
  if (
    (a.design.primaryMetricId && a.design.primaryMetricId === b.design.primaryMetricId) ||
    pages.some((p) => SENSITIVE_PAGES.includes(p)) ||
    Math.max(shareOfA, shareOfB) > HIGH_SHARE_THRESHOLD
  )
    severity = 'alto';
  else if (daily < LOW_DAILY_THRESHOLD && Math.max(shareOfA, shareOfB) < LOW_SHARE_THRESHOLD) severity = 'baixo';

  return { otherFaroId: b.faroId, severity, estimatedDailyUsers: daily };
}

/** SEG-06: maior tráfego entre as páginas × share das plataformas × público × % de tráfego. */
export function estimateEligibleDaily(allocation: Allocation, audience: Audience): number {
  const { pages, platformShare } = fx.pages;
  const daily = allocation.pages.map((id) => pages.find((p) => p.id === id)?.dailyUsers ?? 0);
  if (!daily.length || !allocation.platforms.length) return 0;
  const plat = allocation.platforms.reduce((s, p) => s + (platformShare[p] ?? 0), 0);
  const share = audience.estimatedShare ?? 1;
  return Math.round(Math.max(...daily) * plat * share * (allocation.trafficPercent / 100));
}

export function audiencePort(): AudiencePort {
  return {
    async pageCatalog() {
      return fx.pages;
    },
    async shortcuts() {
      return shortcuts();
    },
    async estimateEligibleDaily(allocation, audience) {
      return estimateEligibleDaily(allocation, audience);
    },
    // SEG-07: o nome do atributo é determinístico; a publicação dos valores é o
    // job jobs/publish-audiences.ts (interino: CSV de cuid até a User Data API).
    async ensureDyAttribute(faroId, audience) {
      if (audience.dyAttribute) return audience.dyAttribute;
      const shortcut = shortcutOf(audience);
      if (shortcut) return shortcut.dyAttribute; // "Todos os clientes" não tem atributo
      return `faro_${faroId.toLowerCase().replaceAll('-', '_')}`;
    },
  };
}

export function overlapPort(): OverlapPort {
  return {
    async listOverlaps(exp, others) {
      return others
        .filter((o) => o.faroId !== exp.faroId && ACTIVE.includes(o.status))
        .map((o) => overlapBetween(exp, o))
        .filter((o): o is OverlapDecision => o !== null);
    },
  };
}
