// E8 — injeta o cadastro do Faro nos marcadores das consultas do roadmap.
// Função pura: template + experimentos → SQL. Sem I/O.
import type { Experiment } from '@faro/contracts';
import { FARO_METRIC_TO_ROADMAP } from '@faro/contracts';
import { MARKER_FORMAT, MARKER_KEYS, ROADMAP_ROW, markerPattern, sqlString, type MarkerKey, type MarkerRows } from './markers.ts';

export interface InjectWarnings {
  warnings: string[];
}

/** Linhas a partir do cadastro: só experimentos com campanha no DY entram. */
export function markerRowsFromExperiments(experiments: Experiment[]): MarkerRows & InjectWarnings {
  const rows: MarkerRows = { overrides: [], linked: [], split: [], norte: [] };
  const warnings: string[] = [];
  for (const e of experiments) {
    const campanha = e.dy?.campaignName?.trim();
    if (!campanha) continue;
    rows.linked.push({ campanha });
    const rw = e.allocation.readWindow;
    rows.overrides.push({ campanha, dataInicio: rw?.start ?? null, dataFim: rw?.end ?? null, controle: e.design.control.name || null });
    const names = [e.design.control.name, ...e.design.variants.map((v) => v.name)];
    const split = e.allocation.split;
    if (split.length !== names.length)
      warnings.push(`${e.faroId}: split com ${split.length} fatias para ${names.length} variações; usando 1/n`);
    names.forEach((variacao, i) =>
      rows.split.push({ campanha, variacao, share: split.length === names.length ? split[i]! : 1 / names.length }),
    );
    const metrica = FARO_METRIC_TO_ROADMAP[e.design.primaryMetricId];
    if (metrica) rows.norte.push({ campanha, metrica });
    else warnings.push(`${e.faroId}: NORTE ${e.design.primaryMetricId} sem equivalente no SQL do roadmap; omitida`);
  }
  return { ...rows, warnings };
}

export function markersIn(template: string): MarkerKey[] {
  return MARKER_KEYS.filter((k) => markerPattern(k).test(template));
}

/**
 * Substitui a linha de cada marcador presente pelas linhas do cadastro do Faro (indentação da linha
 * do marcador) e descarta as linhas do cadastro do roadmap que vêm logo abaixo (`, STRUCT(...)`).
 */
export function injectMarkers(template: string, rows: MarkerRows): string {
  let sql = template;
  for (const key of MARKER_KEYS) {
    const m = markerPattern(key).exec(sql);
    if (!m) continue;
    const indent = m[1] ?? '';
    // fim do trecho a remover: marcador + linhas de cadastro do roadmap contíguas
    let end = m.index + m[0].length;
    for (;;) {
      const nl = sql.indexOf('\n', end);
      if (nl < 0) break;
      const next = sql.slice(nl + 1, sql.indexOf('\n', nl + 1) < 0 ? undefined : sql.indexOf('\n', nl + 1));
      if (!ROADMAP_ROW.test(next)) break;
      end = nl + 1 + next.length;
    }
    const fmt = MARKER_FORMAT[key] as (r: MarkerRows[typeof key][number]) => string;
    const list = rows[key] as MarkerRows[typeof key][number][];
    const body = list.length ? list.map((r) => `${indent}${fmt(r)}`) : [`${indent}-- cadastro do Faro: nenhum experimento com campanha no DY`];
    sql = sql.slice(0, m.index) + body.join('\n') + sql.slice(end);
  }
  return sql;
}

const DECLARE_ALVO = /DECLARE\s+campanha_alvo\s+STRING(\s+DEFAULT\s+[^;]+)?\s*;/i;

/** Define `campanha_alvo` no SQL (substitui o DECLARE existente ou acrescenta no topo). */
export function setCampanhaAlvo(sql: string, campanha: string | undefined): string {
  if (!campanha) return sql;
  const decl = `DECLARE campanha_alvo STRING DEFAULT ${sqlString(campanha)};`;
  return DECLARE_ALVO.test(sql) ? sql.replace(DECLARE_ALVO, decl) : `${decl}\n${sql}`;
}

export interface QueryTemplates {
  results: string;
  discovery: string;
  daily: string;
}

export function buildQueries(templates: QueryTemplates, experiments: Experiment[], opts: { campanha?: string } = {}): QueryTemplates & InjectWarnings {
  const rows = markerRowsFromExperiments(experiments);
  const warnings = [...rows.warnings];
  const present = new Set<MarkerKey>([...markersIn(templates.results), ...markersIn(templates.discovery), ...markersIn(templates.daily)]);
  for (const k of MARKER_KEYS) if (!present.has(k)) warnings.push(`marcador -- {${k}} não aparece em nenhuma consulta`);
  const build = (t: string) => setCampanhaAlvo(injectMarkers(t, rows), opts.campanha);
  return { results: build(templates.results), discovery: build(templates.discovery), daily: build(templates.daily), warnings };
}
