import { BuSchema, EXPERIMENT_STATUSES, PlatformSchema } from '@faro/contracts';
import type { Bu, Experiment, ExperimentStatus, Platform } from '@faro/contracts';
import { matchesSearch } from './search';
import { sortRows } from './sort';
import { DEFAULT_FILTERS, SORT_KEYS, type PainelFilters, type PainelRow, type SortKey } from './types';

/** PNL-02: testes `ecossistema` aparecem em qualquer filtro de BU. */
export function inBu(e: Experiment, bu: PainelFilters['bu']): boolean {
  return bu === 'todas' || e.bu === bu || e.bu === 'ecossistema';
}

function overlapsPeriod(e: Experiment, from?: string, to?: string): boolean {
  const { startDate, endDate } = e.allocation;
  if (from && endDate < from) return false;
  if (to && startDate > to) return false;
  return true;
}

const anyOf = <T>(selected: readonly T[], values: readonly T[]) =>
  selected.length === 0 || values.some((v) => selected.includes(v));

export function matchesFilters(row: PainelRow, f: PainelFilters): boolean {
  const e = row.experiment;
  return (
    inBu(e, f.bu) &&
    anyOf(f.status, [e.status]) &&
    anyOf(f.squad, [e.ownerSquad]) &&
    anyOf(f.platform, e.allocation.platforms) &&
    anyOf(f.page, e.allocation.pages) &&
    overlapsPeriod(e, f.from, f.to) &&
    (!f.hasAlert || row.alerts.length > 0) &&
    (!f.legacy || e.legacy === true) &&
    matchesSearch(e, f.q)
  );
}

export function applyFilters(rows: readonly PainelRow[], f: PainelFilters): PainelRow[] {
  return sortRows(
    rows.filter((r) => matchesFilters(r, f)),
    f.sort,
    f.dir,
  );
}

// ---- URL (PNL-02: filtros refletidos na URL) ----
// Só valores de domínio vão para a URL; nada de dado pessoal (contexto, seção 4).

export type QueryValue = string | null | undefined | (string | null)[];
export type Query = Record<string, QueryValue>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_Q = 120;

function first(v: QueryValue): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ?? undefined;
}

function list(v: QueryValue): string[] {
  const raw = Array.isArray(v) ? v : [v];
  return raw
    .flatMap((s) => (s ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function oneOf<T extends string>(allowed: readonly T[], values: string[]): T[] {
  return [...new Set(values.filter((v): v is T => (allowed as readonly string[]).includes(v)))];
}

/** Lê a query string de forma defensiva: valor desconhecido é ignorado, nunca lança. */
export function parseFilters(query: Query): PainelFilters {
  const bu = first(query.bu);
  const sort = first(query.sort);
  const from = first(query.de);
  const to = first(query.ate);
  return {
    bu: bu && BuSchema.options.includes(bu as Bu) ? (bu as Bu) : DEFAULT_FILTERS.bu,
    status: oneOf<ExperimentStatus>(EXPERIMENT_STATUSES, list(query.status)),
    squad: [...new Set(list(query.squad))].slice(0, 20),
    platform: oneOf<Platform>(PlatformSchema.options, list(query.plataforma)),
    page: [...new Set(list(query.pagina))].slice(0, 20),
    ...(from && ISO_DATE.test(from) ? { from } : {}),
    ...(to && ISO_DATE.test(to) ? { to } : {}),
    hasAlert: first(query.alerta) === '1',
    legacy: first(query.legado) === '1',
    q: (first(query.q) ?? '').slice(0, MAX_Q),
    sort: sort && SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_FILTERS.sort,
    dir: first(query.dir) === 'desc' ? 'desc' : 'asc',
  };
}

/** Serializa omitindo valores padrão, para URLs curtas e estáveis. */
export function filtersToQuery(f: PainelFilters): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.bu !== DEFAULT_FILTERS.bu) q.bu = f.bu;
  if (f.status.length) q.status = f.status.join(',');
  if (f.squad.length) q.squad = f.squad.join(',');
  if (f.platform.length) q.plataforma = f.platform.join(',');
  if (f.page.length) q.pagina = f.page.join(',');
  if (f.from) q.de = f.from;
  if (f.to) q.ate = f.to;
  if (f.hasAlert) q.alerta = '1';
  if (f.legacy) q.legado = '1';
  if (f.q.trim()) q.q = f.q.trim();
  if (f.sort !== DEFAULT_FILTERS.sort) q.sort = f.sort;
  if (f.dir !== DEFAULT_FILTERS.dir) q.dir = f.dir;
  return q;
}
