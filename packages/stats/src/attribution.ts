/**
 * Regras da camada de exposição (MET-04/MET-05) em TypeScript puro, espelhadas pelos modelos SQL em data/models.
 * Servem de oráculo para os testes: contaminados excluídos, eventos antes da exposição não contam.
 */
import type { Platform } from '@faro/contracts';

export interface Impression { userKey: string; variantKey: string; at: string; platform: Platform }
export interface Exposure { userKey: string; variantKey: string; firstExposureAt: string; platform: Platform; contaminated: boolean; variantsSeen: string[] }
export interface BusinessEvent { userKey: string; at: string; value: number; eventType?: string }
export interface AttributedEvent extends BusinessEvent { variantKey: string; platform: Platform }
export interface Window { start?: string; end?: string }

/** Janela em dias (YYYY-MM-DD, inclusiva); timestamps ISO são comparados pela data. */
const inWindow = (at: string, w?: Window): boolean => {
  const day = at.slice(0, 10);
  if (w?.start && day < w.start) return false;
  if (w?.end && day > w.end) return false;
  return true;
};

/** Uma linha por usuário: variante, primeira exposição, plataforma da primeira exposição e flag de contaminação. */
export function buildExposures(impressions: Impression[], window?: Window): Exposure[] {
  const byUser = new Map<string, Exposure>();
  const sorted = [...impressions].filter((i) => inWindow(i.at, window)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const imp of sorted) {
    const cur = byUser.get(imp.userKey);
    if (!cur) {
      byUser.set(imp.userKey, { userKey: imp.userKey, variantKey: imp.variantKey, firstExposureAt: imp.at, platform: imp.platform, contaminated: false, variantsSeen: [imp.variantKey] });
    } else if (!cur.variantsSeen.includes(imp.variantKey)) {
      cur.variantsSeen.push(imp.variantKey);
      cur.contaminated = true;
    }
  }
  return [...byUser.values()];
}

/** Só eventos após a primeira exposição, dentro da janela, de usuários não contaminados. */
export function attributeEvents(exposures: Exposure[], events: BusinessEvent[], window?: Window, options: { excludeContaminated?: boolean } = {}): AttributedEvent[] {
  const exclude = options.excludeContaminated ?? true;
  const byUser = new Map(exposures.map((e) => [e.userKey, e]));
  const out: AttributedEvent[] = [];
  for (const ev of events) {
    const exp = byUser.get(ev.userKey);
    if (!exp) continue;
    if (exclude && exp.contaminated) continue;
    if (ev.at < exp.firstExposureAt) continue;
    if (!inWindow(ev.at, window)) continue;
    out.push({ ...ev, variantKey: exp.variantKey, platform: exp.platform });
  }
  return out;
}

export function contaminationSummary(exposures: Exposure[]): { users: number; share: number } {
  const users = exposures.filter((e) => e.contaminated).length;
  return { users, share: exposures.length ? users / exposures.length : 0 };
}
