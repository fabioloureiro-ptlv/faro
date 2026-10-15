import type { Bu, Experiment, ExperimentStatus, OverlapDecision, PageDefinition } from '@faro/contracts';
import { inBu } from './filters';

// PNL-06: mapa temporal. Linhas por página, barras por teste, linha de hoje, contorno
// quando o teste cruza outro na mesma página (sobreposição vinda da frente 3).

const DAY = 864e5;
const toDay = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  return fromDay(toDay(iso) + n);
}

/** Antes do DY o período ainda é plano; a UI desenha tracejado. */
export const PLANNED_STATUSES: readonly ExperimentStatus[] = [
  'rascunho',
  'design_completo',
  'pronto_para_configurar',
];
const HIDDEN_STATUSES: readonly ExperimentStatus[] = ['cancelado'];

export interface TimeMapBar {
  faroId: string;
  name: string;
  bu: Bu;
  status: ExperimentStatus;
  startDate: string;
  endDate: string;
  /** Posição em % da janela (já recortada). */
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  /** Sub-linha dentro da página, para barras simultâneas não se cobrirem. */
  row: number;
  planned: boolean;
  /** Pior sobreposição com outro teste visível na mesma página e período. */
  overlap?: OverlapDecision['severity'];
  overlapUnresolved: boolean;
  /** Com filtro de BU: teste de outra BU que cruza um teste da BU. */
  faded: boolean;
}

export interface TimeMapLane {
  pageId: string;
  pageName: string;
  rows: number;
  bars: TimeMapBar[];
}

export interface TimeMapTick {
  label: string;
  left: number;
}

export interface TimeMap {
  start: string;
  end: string;
  today: string;
  /** undefined quando hoje está fora da janela. */
  todayLeft?: number;
  ticks: TimeMapTick[];
  lanes: TimeMapLane[];
}

export interface TimeMapOptions {
  bu: Bu | 'todas';
  today: string;
  /** Janela; padrão: 45 dias para trás e 75 para frente de hoje. */
  from?: string;
  to?: string;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEVERITY_RANK = { baixo: 1, medio: 2, alto: 3 } as const;

const intersects = (a: Experiment, b: Experiment) =>
  a.allocation.startDate <= b.allocation.endDate && b.allocation.startDate <= a.allocation.endDate;

export function buildTimeMap(
  experiments: readonly Experiment[],
  pages: readonly PageDefinition[],
  opts: TimeMapOptions,
): TimeMap {
  const start = opts.from ?? addDays(opts.today, -45);
  const end = opts.to ?? addDays(opts.today, 75);
  const s = toDay(start);
  const total = toDay(end) - s + 1;
  const pct = (day: number) => ((day - s) / total) * 100;

  const inWindow = experiments.filter(
    (e) =>
      !HIDDEN_STATUSES.includes(e.status) && e.allocation.startDate <= end && e.allocation.endDate >= start,
  );

  const lanes: TimeMapLane[] = [];
  for (const page of pages) {
    const onPage = inWindow.filter((e) => e.allocation.pages.includes(page.id));
    const own = onPage.filter((e) => inBu(e, opts.bu));
    // Outras BUs só entram se cruzam no tempo algum teste da BU nesta página.
    const crossing = onPage.filter((e) => !inBu(e, opts.bu) && own.some((o) => intersects(o, e)));
    const visible = [...own, ...crossing].sort(
      (a, b) =>
        a.allocation.startDate.localeCompare(b.allocation.startDate) || a.faroId.localeCompare(b.faroId),
    );
    if (visible.length === 0) continue;

    const visibleIds = new Set(visible.map((e) => e.faroId));
    const rowEnds: string[] = []; // último endDate ocupado em cada sub-linha
    const bars = visible.map((e): TimeMapBar => {
      const a = e.allocation;
      let row = rowEnds.findIndex((lastEnd) => lastEnd < a.startDate);
      if (row === -1) row = rowEnds.push(a.endDate) - 1;
      else rowEnds[row] = a.endDate;

      const related = (e.overlap ?? []).filter((o) => {
        if (!visibleIds.has(o.otherFaroId)) return false;
        const other = visible.find((x) => x.faroId === o.otherFaroId)!;
        return intersects(e, other);
      });
      const worst = related.reduce<OverlapDecision['severity'] | undefined>(
        (w, o) => (!w || SEVERITY_RANK[o.severity] > SEVERITY_RANK[w] ? o.severity : w),
        undefined,
      );

      const from = Math.max(toDay(a.startDate), s);
      const to = Math.min(toDay(a.endDate), toDay(end));
      return {
        faroId: e.faroId,
        name: e.name,
        bu: e.bu,
        status: e.status,
        startDate: a.startDate,
        endDate: a.endDate,
        left: pct(from),
        width: ((to - from + 1) / total) * 100,
        clippedStart: toDay(a.startDate) < s,
        clippedEnd: toDay(a.endDate) > toDay(end),
        row,
        planned: PLANNED_STATUSES.includes(e.status),
        ...(worst ? { overlap: worst } : {}),
        overlapUnresolved: related.some((o) => !o.resolution),
        faded: !inBu(e, opts.bu),
      };
    });
    lanes.push({ pageId: page.id, pageName: page.name, rows: rowEnds.length, bars });
  }

  const ticks: TimeMapTick[] = [];
  const first = new Date(`${start}T00:00:00Z`);
  for (let y = first.getUTCFullYear(), m = first.getUTCMonth() + 1; ; m++) {
    if (m === 12) {
      m = 0;
      y++;
    }
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    if (iso > end) break;
    ticks.push({ label: `${MONTHS[m]}${m === 0 ? ` ${y}` : ''}`, left: pct(toDay(iso)) });
  }

  const t = toDay(opts.today);
  return {
    start,
    end,
    today: opts.today,
    ...(t >= s && t <= toDay(end) ? { todayLeft: pct(t) + 50 / total } : {}),
    ticks,
    lanes,
  };
}
