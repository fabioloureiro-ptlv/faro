// E8 — marcadores das consultas do roadmap e a forma das linhas que o Faro injeta.
// Tudo o que depende da forma exata das consultas fica aqui, em um lugar só.
//
// Forma confirmada em data/models/results/dy_results.sql (v3): cada bloco `cfg_*` é um UNNEST com
// uma primeira linha tipada (campanha vazia), a linha do marcador e, abaixo dela, o cadastro do
// próprio roadmap, uma linha por `, STRUCT(...)` (ou `, '<campanha>'` em `linked`). O Faro troca o
// marcador pelo cadastro dele, com vírgula à frente, e descarta as linhas do cadastro do roadmap.
// DECISAO-PENDENTE: dy_discovery.sql e dy_daily_v3.sql ainda não estão no repositório; assume-se a mesma forma.
export type MarkerKey = 'overrides' | 'linked' | 'split' | 'norte';
export const MARKER_KEYS: readonly MarkerKey[] = ['overrides', 'linked', 'split', 'norte'];

export interface OverrideRow {
  campanha: string;
  dataInicio: string | null;
  dataFim: string | null;
  controle: string | null;
}
export interface LinkedRow {
  campanha: string;
}
export interface SplitRow {
  campanha: string;
  variacao: string;
  share: number;
}
export interface NorteRow {
  campanha: string;
  metrica: string;
}

export interface MarkerRows {
  overrides: OverrideRow[];
  linked: LinkedRow[];
  split: SplitRow[];
  norte: NorteRow[];
}

/** Literal de string do BigQuery: escapa barra e aspas simples; quebra de linha vira espaço. */
export function sqlString(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, ' ')}'`;
}
export function sqlDate(d: string | null): string {
  if (!d) return 'CAST(NULL AS DATE)';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`data fora de AAAA-MM-DD: ${d}`);
  return `DATE '${d}'`;
}
export function sqlNumber(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`número inválido: ${x}`);
  return String(x);
}

/** Uma linha por marcador, já com a vírgula à frente (a primeira linha tipada do UNNEST vem antes). */
export const MARKER_FORMAT: { [K in MarkerKey]: (r: MarkerRows[K][number]) => string } = {
  overrides: (r: OverrideRow) =>
    `, STRUCT(${sqlString(r.campanha)}, ${sqlDate(r.dataInicio)}, ${sqlDate(r.dataFim)}, ${r.controle ? sqlString(r.controle) : 'CAST(NULL AS STRING)'})`,
  linked: (r: LinkedRow) => `, ${sqlString(r.campanha)}`,
  split: (r: SplitRow) => `, STRUCT(${sqlString(r.campanha)}, ${sqlString(r.variacao)}, ${sqlNumber(r.share)})`,
  norte: (r: NorteRow) => `, STRUCT(${sqlString(r.campanha)}, ${sqlString(r.metrica)})`,
};

/** Linha do marcador no template: `-- {overrides}` (espaços em volta permitidos). */
export const markerPattern = (key: MarkerKey) => new RegExp(`^([ \\t]*)--[ \\t]*\\{${key}\\}[ \\t]*$`, 'm');

/** Linha do cadastro do roadmap logo abaixo do marcador: `, STRUCT(...)` ou `, '...'`. */
export const ROADMAP_ROW = /^[ \t]*,[ \t]*(STRUCT\(|')/;
