// MOCK da frente 3: elegíveis por dia e publicação de atributo DY.
import type { Allocation, Audience } from '@faro/contracts';
import type { AudiencePort } from '../ports.ts';
import { fx } from './fixtures.ts';

/** Maior tráfego entre as páginas × share das plataformas × share do público × % de tráfego. */
export function estimateEligibleDaily(allocation: Allocation, audience: Audience): number {
  const { pages, platformShare } = fx.pages;
  const daily = allocation.pages.map((id) => pages.find((p) => p.id === id)?.dailyUsers ?? 0);
  if (!daily.length || !allocation.platforms.length) return 0;
  const plat = allocation.platforms.reduce((s, p) => s + (platformShare[p] ?? 0), 0);
  const share = audience.estimatedShare ?? 1;
  return Math.round(Math.max(...daily) * plat * share * (allocation.trafficPercent / 100));
}

export function mockAudience(): AudiencePort {
  return {
    async pageCatalog() {
      return fx.pages;
    },
    async shortcuts() {
      return fx.audiences;
    },
    async estimateEligibleDaily(allocation, audience) {
      return estimateEligibleDaily(allocation, audience);
    },
    async ensureDyAttribute(faroId, audience) {
      if (audience.dyAttribute) return audience.dyAttribute;
      const shortcut = fx.audiences.find((a) => a.name.toLowerCase() === audience.description.trim().toLowerCase());
      if (shortcut) return shortcut.dyAttribute; // "Todos os clientes" não tem atributo
      return `faro_${faroId.toLowerCase().replaceAll('-', '_')}`;
    },
  };
}
