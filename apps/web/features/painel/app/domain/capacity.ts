import type { Experiment, ExperimentStatus, PageDefinition, Platform } from '@faro/contracts';
import { addDays } from './time-map';

// PNL-12: por página e plataforma, quantos testes ocupam o DY hoje e qual fração dos
// usuários já está comprometida. Ajuda a escolher onde testar.

export const CAPACITY_PLATFORMS: readonly Platform[] = ['site', 'android', 'ios'];

/** Ocupam tráfego no DY. `decidido` ainda está ativo por definição (só sai ao encerrar). */
const OCCUPYING: readonly ExperimentStatus[] = ['configurado_no_dy', 'rodando', 'decidido'];
/** Aparecem como "chegando": já têm design aprovado. Rascunho ainda é intenção. */
const UPCOMING: readonly ExperimentStatus[] = [
  'design_completo',
  'pronto_para_configurar',
  'configurado_no_dy',
];

export type CapacityLevel = 'baixo' | 'medio' | 'alto';

export interface CapacityTest {
  faroId: string;
  name: string;
  /** Fração dos usuários da página/plataforma que o teste ocupa (tráfego × público). */
  occupancy: number;
  /** Público sem estimativa: assumido 100%. */
  assumedFullAudience: boolean;
}

export interface CapacityCell {
  platform: Platform;
  active: CapacityTest[];
  upcoming: { faroId: string; name: string; startDate: string }[];
  /** Fração dos usuários já em algum teste (0–1). */
  committed: number;
  /** Usuários/dia ainda livres; ausente sem dado de tráfego por plataforma. */
  freeDailyUsers?: number;
  level: CapacityLevel;
}

export interface CapacityRow {
  pageId: string;
  pageName: string;
  cells: CapacityCell[];
}

export interface CapacityView {
  today: string;
  horizonEnd: string;
  rows: CapacityRow[];
}

export function capacityLevel(committed: number): CapacityLevel {
  if (committed >= 0.8) return 'alto';
  if (committed >= 0.5) return 'medio';
  return 'baixo';
}

const occupancyOf = (e: Experiment) => (e.allocation.trafficPercent / 100) * (e.audience.estimatedShare ?? 1);

/**
 * Mesmo grupo de exclusão mútua: os testes dividem os usuários, então as ocupações somam.
 * Entre grupos/testes independentes: fração em pelo menos um = 1 − Π(1 − ocupação).
 */
export function committedShare(tests: readonly Experiment[]): number {
  const groups = new Map<string, number>();
  const units: number[] = [];
  for (const e of tests) {
    const g = e.allocation.exclusionGroupId;
    if (g) groups.set(g, (groups.get(g) ?? 0) + occupancyOf(e));
    else units.push(occupancyOf(e));
  }
  for (const sum of groups.values()) units.push(sum);
  return 1 - units.reduce((free, u) => free * (1 - Math.min(1, u)), 1);
}

const isOccupying = (e: Experiment, today: string) =>
  OCCUPYING.includes(e.status) && (e.status !== 'configurado_no_dy' || e.allocation.startDate <= today);

export function buildCapacity(
  experiments: readonly Experiment[],
  pages: readonly PageDefinition[],
  opts: { today: string; horizonDays?: number },
): CapacityView {
  const horizonEnd = addDays(opts.today, opts.horizonDays ?? 30);
  const occupying = experiments.filter((e) => isOccupying(e, opts.today));
  const upcoming = experiments.filter(
    (e) =>
      UPCOMING.includes(e.status) &&
      e.allocation.startDate > opts.today &&
      e.allocation.startDate <= horizonEnd,
  );
  const on = (e: Experiment, page: string, platform: Platform) =>
    e.allocation.pages.includes(page) && e.allocation.platforms.includes(platform);

  const rows = pages.map((page) => ({
    pageId: page.id,
    pageName: page.name,
    cells: CAPACITY_PLATFORMS.map((platform): CapacityCell => {
      const active = occupying.filter((e) => on(e, page.id, platform));
      const committed = committedShare(active);
      const daily = page.dailyUsersByPlatform?.[platform];
      return {
        platform,
        active: active.map((e) => ({
          faroId: e.faroId,
          name: e.name,
          occupancy: occupancyOf(e),
          assumedFullAudience: e.audience.estimatedShare === undefined,
        })),
        upcoming: upcoming
          .filter((e) => on(e, page.id, platform))
          .map((e) => ({ faroId: e.faroId, name: e.name, startDate: e.allocation.startDate })),
        committed,
        ...(daily !== undefined ? { freeDailyUsers: Math.round(daily * (1 - committed)) } : {}),
        level: capacityLevel(committed),
      };
    }),
  }));
  return { today: opts.today, horizonEnd, rows };
}
