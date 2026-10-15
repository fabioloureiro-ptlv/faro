// E8 — forma das linhas das consultas do roadmap (dy_results v3, dy_discovery, dy_daily v3).
// Schemas tolerantes: validam o que o adapter usa e deixam passar o resto (passthrough),
// porque as colunas por métrica são muitas e a v4 vai mudar a lista.
//
// DECISAO-PENDENTE: as colunas do discovery e do daily só serão confirmadas quando as duas
// consultas forem salvas em data/queries/roadmap/ (hoje só a de resultados está no repositório).
import { z } from 'zod';

const toNumber = (v: unknown) =>
  typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
const toBool = (v: unknown) =>
  v === 1 || v === '1' || v === 'true' || v === 'TRUE' ? true : v === 0 || v === '0' || v === 'false' || v === 'FALSE' ? false : v;
export const num = z.preprocess(toNumber, z.number().nullable().optional());
export const bool = z.preprocess(toBool, z.boolean().nullable().optional());
const str = z.string().nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const resultsRowSchema = z
  .object({
    grao: z.enum(['usuario', 'sessao']),
    stream: z.enum(['web', 'app']),
    bu: str,
    campanha: z.string().min(1),
    device: z.string().min(1),
    variacao: z.string().min(1),
    is_controle: bool,
    unidades: num,
    compradores: num,
    transacoes: num,
    receita: num,
    share_unidades: num,
    p_srm: num,
    usuarios_2_variantes: num,
    status: str,
    dias_leitura: num,
    metrica_norte: str,
    guardas_piora: str,
    dados_ate: isoDate.nullable().optional(),
    data_inicio_leitura: isoDate.nullable().optional(),
    data_fim_leitura: isoDate.nullable().optional(),
    origem_datas: str,
    primeiro_dia_split_estavel: isoDate.nullable().optional(),
  })
  .passthrough();

export const discoveryRowSchema = z
  .object({
    campanha: z.string().min(1),
    stream: z.enum(['web', 'app']),
    bu: str,
    estado: str,
    variantes: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    min_share_7d: num,
    novo_nos_7d: bool,
    onde: str,
  })
  .passthrough();

export const dailyRowSchema = z
  .object({
    campanha: z.string().min(1),
    stream: z.enum(['web', 'app']),
    device: z.string().min(1),
    variacao: z.string().min(1),
    dia: isoDate,
    usuarios_novos: num,
    usuarios_leitura: num,
    compradores: num,
    transacoes: num,
    receita: num,
  })
  .passthrough();

export type ResultsRow = z.infer<typeof resultsRowSchema>;
export type DiscoveryRow = z.infer<typeof discoveryRowSchema>;
export type DailyRow = z.infer<typeof dailyRowSchema>;

export interface SnapshotMeta {
  /** Pasta do snapshot (dados_ate) ou o arquivo de origem, quando só há a consulta de resultados. */
  dir: string;
  dadosAte: string;
  fetchedAt: string;
  sqlVersion: string;
  campanha?: string;
}

export interface RoadmapSnapshot {
  results: ResultsRow[];
  discovery: DiscoveryRow[];
  daily: DailyRow[];
  meta: SnapshotMeta;
}

export function parseRows<S extends z.ZodTypeAny>(schema: S, raw: unknown, label: string): z.output<S>[] {
  if (!Array.isArray(raw)) throw new Error(`${label}: esperado um array de linhas`);
  const out: z.output<S>[] = [];
  const errors: string[] = [];
  raw.forEach((r, i) => {
    const p = schema.safeParse(r);
    if (p.success) out.push(p.data);
    else if (errors.length < 5)
      errors.push(`linha ${i}: ${p.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
  });
  if (errors.length) throw new Error(`${label}: linhas inválidas — ${errors.join(' | ')}`);
  return out;
}
