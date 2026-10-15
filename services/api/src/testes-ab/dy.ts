// Aba Teste AB, "Rodando no DY": lista e detalhe dos testes a partir das linhas reais da consulta de
// resultados (dy_results v3, o mesmo snapshot que o painel usa). A consulta traz uma linha por
// teste × grão × device × variante; "Total" é o device consolidado.
import type { Bu } from '@faro/contracts';
import { BU_BY_COL } from '../resultados/roadmap/adapter.ts';
import type { ResultsRow } from '../resultados/roadmap/types.ts';
import {
  flag,
  METRICAS,
  metricaPorColuna,
  metricaPorKey,
  num,
  significancia,
  statusDe,
  texto,
  type MetricaDef,
  type Significancia,
  type StatusTeste,
} from './metricas.ts';
import type { TesteRoadmap, Vinculo } from './roadmap.ts';

export type Grao = 'usuario' | 'sessao';
export type StreamFiltro = 'todos' | 'web' | 'app';

export interface Comparacao {
  uplift: number;
  low: number | null;
  high: number | null;
  p: number | null;
  confirmado: boolean;
  sig: Significancia | null;
}

export const chaveTeste = (r: Pick<ResultsRow, 'stream' | 'campanha'>) => `${r.stream}|${r.campanha}`;

/** Controle primeiro; as demais variantes por nome. */
function ordenar(rows: ResultsRow[]): ResultsRow[] {
  return [...rows].sort((a, b) => Number(!!b.is_controle) - Number(!!a.is_controle) || a.variacao.localeCompare(b.variacao, 'pt-BR'));
}

export function comparar(v: ResultsRow, m: MetricaDef): Comparacao | null {
  const uplift = num(v, `uplift_${m.col}`);
  if (uplift == null) return null;
  const p = num(v, `p_vence_${m.col}`);
  return { uplift, low: num(v, `ic_lo_${m.col}`), high: num(v, `ic_hi_${m.col}`), p, confirmado: flag(v, `confirmado_${m.col}`), sig: significancia(p) };
}

/** Melhor variante contra o controle: a de maior P(vence) na métrica. */
export function melhorVariante(outras: ResultsRow[], m: MetricaDef): { row: ResultsRow; cmp: Comparacao } | null {
  let best: { row: ResultsRow; cmp: Comparacao } | null = null;
  for (const row of outras) {
    const cmp = comparar(row, m);
    if (cmp && (!best || (cmp.p ?? 0) > (best.cmp.p ?? 0))) best = { row, cmp };
  }
  return best;
}

function agrupar(rows: ResultsRow[], grao: Grao): Map<string, ResultsRow[]> {
  const map = new Map<string, ResultsRow[]>();
  for (const r of rows) {
    if (r.grao !== grao) continue;
    const k = chaveTeste(r);
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  return map;
}

const consolidado = (rows: ResultsRow[]) => ordenar(rows.filter((r) => r.device === 'Total'));

export interface LinhaDy {
  key: string;
  campanha: string;
  stream: 'web' | 'app';
  /** BU como o painel usa (ecom, saude, ecossistema…). */
  area: Bu;
  bu: string | null;
  cross: boolean;
  base: number;
  unidade: 'usuários' | 'sessões';
  split: string;
  status: StatusTeste;
  variantes: number;
  controle: number | null;
  melhor: { nome: string; valor: number | null } | null;
  cmp: Comparacao | null;
  /** Testes do roadmap atrelados (#id) e relacionados (entre parênteses na tela). */
  roadmap: { atrelados: number[]; relacionados: number[] };
  /** Onde roda: plataformas pela origem (site ou app) e páginas do export da DY (ids do catálogo). */
  plataformas: string[];
  paginas: string[];
  /** Janela de leitura da consulta. */
  periodo: { inicio: string | null; fim: string | null; dias: number | null };
  /** Métrica NORTE do teste e o resultado da melhor variante nela. */
  norte: { key: string; label: string; formato: MetricaDef['formato']; cmp: Comparacao | null };
  alertas: string[];
  /** Outros testes rodando na mesma página com período que cruza este. */
  mesmaPagina: number;
  squad?: string;
}

export interface ListaDy {
  grao: Grao;
  stream: StreamFiltro;
  metrica: { key: string; label: string; formato: MetricaDef['formato'] };
  kpis: { testes: number; splitValido: number; decididosLigados: number; confirmados: number };
  statusContagem: Record<StatusTeste['key'], number>;
  testes: LinhaDy[];
}

export interface OpcoesListaDy {
  grao?: Grao;
  stream?: StreamFiltro;
  metrica?: string;
  vinculos?: Map<string, Vinculo>;
  /** Páginas por campanha (export da DY), chave = nome da campanha em minúsculas. */
  paginas?: Map<string, { pages: string[] }>;
  /** Ids de páginas que existem no catálogo; o resto é ignorado. */
  paginasValidas?: Set<string>;
  /** Squad por campanha, quando o teste está atrelado ao roadmap. */
  squads?: Map<string, string>;
}

function alertasDe(controle: ResultsRow, status: StatusTeste): string[] {
  const out: string[] = [];
  if (status.key === 'split_desigual') out.push('Split desigual');
  if (status.key === 'volume_baixo') out.push('Volume baixo');
  if (status.key === 'decidido') out.push('Decidido, campanha ainda ligada');
  const guardas = texto(controle, 'guardas_piora');
  if (guardas) out.push(`Guarda piorando: ${guardas}`);
  const dois = controle.usuarios_2_variantes ?? 0;
  if (dois > 0) out.push(`${dois.toLocaleString('pt-BR')} usuários em 2 variantes (excluídos)`);
  if (controle.dias_leitura != null && controle.dias_leitura < 7) out.push('Menos de 7 dias de leitura');
  return out;
}

export function listarDy(rows: ResultsRow[], opts: OpcoesListaDy): ListaDy {
  const grao = opts.grao ?? 'usuario';
  const stream = opts.stream ?? 'todos';
  const m = metricaPorKey(opts.metrica);
  const testes: LinhaDy[] = [];
  const statusContagem: ListaDy['statusContagem'] = { saudavel: 0, split_desigual: 0, volume_baixo: 0, decidido: 0 };
  let confirmados = 0;

  for (const grupo of agrupar(rows, grao).values()) {
    const total = consolidado(grupo);
    const controle = total.find((r) => r.is_controle) ?? total[0];
    if (!controle || (stream !== 'todos' && controle.stream !== stream)) continue;
    const outras = total.filter((r) => r !== controle);
    const status = statusDe(controle.status);
    statusContagem[status.key] += 1;

    const comparavel = status.key !== 'decidido' && outras.length > 0;
    const melhor = comparavel ? melhorVariante(outras, m) : null;
    // "Resultado confirmado" = melhora confirmada em teste saudável (piora confirmada ou split torto não contam).
    if (melhor?.cmp.confirmado && melhor.cmp.uplift > 0 && status.key === 'saudavel') confirmados += 1;
    const v = vinculos(opts.vinculos, controle.campanha);

    const norteM = metricaPorColuna(texto(controle, 'metrica_norte')) ?? m;
    const norteMelhor = comparavel ? melhorVariante(outras, norteM) : null;
    const inicios = grupo.map((r) => r.data_inicio_leitura).filter((d): d is string => !!d).sort();
    const fins = grupo.map((r) => r.data_fim_leitura).filter((d): d is string => !!d).sort();
    const paginas = (opts.paginas?.get(controle.campanha.trim().toLowerCase())?.pages ?? []).filter((p) => !opts.paginasValidas || opts.paginasValidas.has(p));
    const squad = opts.squads?.get(controle.campanha);

    testes.push({
      key: chaveTeste(controle),
      campanha: controle.campanha,
      stream: controle.stream,
      area: BU_BY_COL(controle.bu ?? ''),
      bu: controle.bu ?? null,
      cross: controle.bu === 'cross',
      base: total.reduce((s, r) => s + (r.unidades ?? 0), 0),
      unidade: grao === 'usuario' ? 'usuários' : 'sessões',
      split: total.map((r) => Math.round((r.share_unidades ?? 0) * 100)).join('/'),
      status,
      variantes: total.length,
      controle: num(controle, m.col),
      melhor: melhor ? { nome: melhor.row.variacao, valor: num(melhor.row, m.col) } : null,
      cmp: melhor?.cmp ?? null,
      roadmap: v,
      plataformas: controle.stream === 'app' ? ['Android', 'iOS'] : ['Site'],
      paginas,
      periodo: { inicio: inicios[0] ?? null, fim: fins.at(-1) ?? null, dias: controle.dias_leitura ?? null },
      norte: { key: norteM.key, label: norteM.label, formato: norteM.formato, cmp: norteMelhor?.cmp ?? null },
      alertas: alertasDe(controle, status),
      mesmaPagina: 0,
      ...(squad ? { squad } : {}),
    });
  }

  // Sobreposição na DY: outros testes ainda rodando na mesma página, com janela que cruza a deste.
  const rodando = testes.filter((t) => t.status.key !== 'decidido' && t.paginas.length && t.periodo.inicio && t.periodo.fim);
  for (const t of rodando) {
    t.mesmaPagina = rodando.filter(
      (o) => o !== t && o.paginas.some((p) => t.paginas.includes(p)) && o.periodo.inicio! <= t.periodo.fim! && t.periodo.inicio! <= o.periodo.fim!,
    ).length;
  }

  testes.sort((a, b) => b.base - a.base);
  return {
    grao,
    stream,
    metrica: { key: m.key, label: m.label, formato: m.formato },
    kpis: {
      testes: testes.length,
      splitValido: testes.filter((t) => t.status.key === 'saudavel').length,
      decididosLigados: testes.filter((t) => t.status.key === 'decidido').length,
      confirmados,
    },
    statusContagem,
    testes,
  };
}

const vinculos = (map: Map<string, Vinculo> | undefined, campanha: string) => {
  const v = map?.get(campanha);
  return { atrelados: v?.atrelados ?? [], relacionados: v?.relacionados ?? [] };
};

// ---------------------------------------------------------------- detalhe

export interface Celula {
  valor: number | null;
  uplift?: number | null;
  sig?: Significancia | null;
}

export interface LinhaTabela {
  chave: string;
  rotulo: string;
  grupo: 'volume' | MetricaDef['grupo'];
  formato: MetricaDef['formato'] | 'int';
  papel?: 'norte' | 'guarda' | 'exploratoria';
  celulas: Celula[];
}

export interface TabelaDevice {
  device: string;
  rotulo: string;
  variantes: string[];
  linhas: LinhaTabela[];
}

export interface DetalheDy {
  key: string;
  campanha: string;
  stream: 'web' | 'app';
  bu: string | null;
  cross: boolean;
  grao: Grao;
  unidade: 'usuários' | 'sessões';
  dadosAte: string | null;
  status: StatusTeste;
  squad?: string;
  objetivo?: string;
  excluidos: { quantidade: number; percentual: number } | null;
  leitura: { inicio: string | null; fim: string | null; dias: number | null; origem: string | null };
  norte: { key: string; label: string };
  variantes: { nome: string; controle: boolean; share: number | null; descricao?: string }[];
  sintese: { variante: string; itens: { rotulo: string; norte: boolean; uplift: number | null; sig: Significancia | null }[] }[];
  recomendacao: { titulo: string; texto: string; tom: 'ok' | 'warn' | 'risk' | 'info' };
  tabelas: TabelaDevice[];
  mde: { variantes: string[]; linhas: { rotulo: string; norte: boolean; valores: (number | null)[] }[] };
  roadmap: { atrelados: number[]; relacionados: number[] };
}

const ROTULO_DEVICE: Record<string, string> = { Total: 'Consolidado' };
const ORDEM_DEVICE = ['Total', 'Android', 'iOS', 'Desktop', 'Mobile'];

const pctFmt = (n: number, casas = 1, sinal = false) => {
  const s = (n * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).replace('-', '−');
  return `${sinal && n > 0 ? '+' : ''}${s}%`;
};

function norteDe(rows: ResultsRow[]): MetricaDef {
  return metricaPorColuna(texto(rows[0]!, 'metrica_norte')) ?? metricaPorKey('rpu');
}

export function recomendar(norte: MetricaDef, v: ResultsRow | undefined): DetalheDy['recomendacao'] {
  const raw = v ? texto(v, `recomendacao_${norte.col}`) : null;
  if (!v || !raw) return { titulo: 'Sem dado', texto: 'A consulta ainda não devolveu leitura para este teste.', tom: 'info' };
  const chance = num(v, `chance_melhor_${norte.col}`) ?? num(v, `p_vence_${norte.col}`);
  const uplift = num(v, `uplift_${norte.col}`);
  const esperado = num(v, `uplift_esperado_${norte.col}`);
  const perdaLigar = num(v, `perda_ligar_${norte.col}`);
  const mde = num(v, `mde_${norte.col}`);
  const nome = norte.label.toLowerCase();
  const leitura = [
    chance != null ? `${Math.round(chance * 100)}% de chance de ${v.variacao} ser melhor em ${nome}.` : '',
    uplift != null ? `Efeito observado ${pctFmt(uplift, 1, true)}${esperado != null ? `; esperado, já descontando o ruído, ${pctFmt(esperado, 1, true)}` : ''}.` : '',
    perdaLigar != null ? `Se ligar e estiver errado, perde em média ${pctFmt(perdaLigar, 2)}.` : '',
    mde != null ? `Hoje o teste enxerga ${pctFmt(mde)} em ${nome}.` : '',
  ].filter(Boolean).join(' ');

  const t = raw.trim();
  if (/^ligar variante/i.test(t)) return { titulo: `Ligar ${v.variacao}`, texto: leitura, tom: 'ok' };
  if (/^manter controle/i.test(t)) return { titulo: 'Manter o controle', texto: leitura, tom: 'warn' };
  if (/^continuar coleta/i.test(t)) return { titulo: 'Continuar coleta', texto: leitura, tom: 'warn' };
  if (/^sem diferen/i.test(t)) return { titulo: 'Sem diferença relevante', texto: `O intervalo de confiança inteiro fica dentro de ±2%. ${leitura}`.trim(), tom: 'warn' };
  if (/^n[aã]o ligar/i.test(t)) return { titulo: 'Não ligar', texto: `${t}. ${leitura}`.trim(), tom: 'risk' };
  if (/^aguardar/i.test(t)) return { titulo: 'Aguardar', texto: t.replace(/^aguardar/i, 'Ainda não dá para decidir').replace(/^Ainda não dá para decidir \((.*)\)$/i, 'Ainda não dá para decidir: $1.'), tom: 'info' };
  return { titulo: t, texto: leitura, tom: 'info' };
}

export function detalharDy(
  rows: ResultsRow[],
  campanha: string,
  stream: 'web' | 'app',
  grao: Grao,
  extra: { teste?: TesteRoadmap; vinculos?: Map<string, Vinculo> } = {},
): DetalheDy | null {
  const doTeste = rows.filter((r) => r.campanha === campanha && r.stream === stream && r.grao === grao);
  const total = consolidado(doTeste);
  const controle = total.find((r) => r.is_controle) ?? total[0];
  if (!controle) return null;
  const outras = total.filter((r) => r !== controle);
  const norte = norteDe(total);
  const status = statusDe(controle.status);
  const unidade = grao === 'usuario' ? 'usuários' : 'sessões';

  const melhorNorte = outras.reduce<ResultsRow | undefined>(
    (b, r) => (!b || (num(r, `chance_melhor_${norte.col}`) ?? 0) > (num(b, `chance_melhor_${norte.col}`) ?? 0) ? r : b),
    undefined,
  );

  const cenarios = extra.teste?.cenarios ?? [];
  const descricaoDe = (nome: string) => cenarios.find((c) => c.nome.toLowerCase() === nome.toLowerCase())?.descricao;
  const base = total.reduce((s, r) => s + (r.unidades ?? 0), 0);
  const excluidos = controle.usuarios_2_variantes ?? 0;

  const trio: MetricaDef[] = [norte, metricaPorKey('conv'), metricaPorKey('rpu')].filter((m, i, a) => a.findIndex((x) => x.key === m.key) === i);

  const devices = ORDEM_DEVICE.filter((d) => doTeste.some((r) => r.device === d));
  const tabelas: TabelaDevice[] = devices.map((device) => {
    const vs = ordenar(doTeste.filter((r) => r.device === device));
    const c = vs.find((r) => r.is_controle) ?? vs[0]!;
    const demais = vs.filter((r) => r !== c);
    const volume = (rotulo: string, chave: string, col: 'unidades' | 'compradores' | 'transacoes' | 'receita', formato: LinhaTabela['formato']): LinhaTabela => {
      const base0 = num(c, col);
      return {
        chave, rotulo, grupo: 'volume', formato,
        celulas: [{ valor: base0 }, ...demais.map((v) => ({ valor: num(v, col), uplift: base0 && num(v, col) != null ? num(v, col)! / base0 - 1 : null }))],
      };
    };
    const metricas = METRICAS.filter((m) => m.grupo !== 'saude' || controle.bu === 'saude').map<LinhaTabela>((m) => {
      const papel = m.col === texto(c, 'metrica_norte') ? 'norte' : (texto(c, `papel_${m.col}`) as LinhaTabela['papel'] | null) ?? undefined;
      return {
        chave: m.key, rotulo: m.label, grupo: m.grupo, formato: m.formato,
        ...(papel ? { papel } : {}),
        celulas: [{ valor: num(c, m.col) }, ...demais.map((v) => ({ valor: num(v, m.col), uplift: num(v, `uplift_${m.col}`), sig: significancia(num(v, `p_vence_${m.col}`)) }))],
      };
    });
    return {
      device,
      rotulo: ROTULO_DEVICE[device] ?? device,
      variantes: vs.map((r) => r.variacao),
      linhas: [
        volume(unidade === 'usuários' ? 'Usuários' : 'Sessões', 'unidades', 'unidades', 'int'),
        volume('Compradores', 'compradores', 'compradores', 'int'),
        volume('Transações', 'transacoes', 'transacoes', 'int'),
        volume('Receita', 'receita', 'receita', 'brl'),
        ...metricas,
      ],
    };
  });

  return {
    key: chaveTeste(controle),
    campanha,
    stream,
    bu: controle.bu ?? null,
    cross: controle.bu === 'cross',
    grao,
    unidade,
    dadosAte: controle.dados_ate ?? null,
    status,
    ...(extra.teste?.squad ? { squad: extra.teste.squad } : {}),
    ...(extra.teste?.indicador ? { objetivo: extra.teste.indicador } : {}),
    excluidos: excluidos > 0 ? { quantidade: excluidos, percentual: excluidos / (base + excluidos) } : null,
    leitura: {
      inicio: controle.data_inicio_leitura ?? null,
      fim: controle.data_fim_leitura ?? null,
      dias: controle.dias_leitura ?? null,
      origem: controle.origem_datas ?? null,
    },
    norte: { key: norte.key, label: norte.label },
    variantes: total.map((r) => ({
      nome: r.variacao,
      controle: !!r.is_controle,
      share: r.share_unidades ?? null,
      ...(descricaoDe(r.variacao) ? { descricao: descricaoDe(r.variacao)! } : {}),
    })),
    sintese: outras.map((v) => ({
      variante: v.variacao,
      itens: trio.map((m) => ({ rotulo: m.label, norte: m.key === norte.key, uplift: num(v, `uplift_${m.col}`), sig: significancia(num(v, `p_vence_${m.col}`)) })),
    })),
    recomendacao: recomendar(norte, melhorNorte),
    tabelas,
    mde: {
      variantes: outras.map((r) => r.variacao),
      linhas: METRICAS.filter((m) => m.grupo !== 'saude' || controle.bu === 'saude').map((m) => ({
        rotulo: m.label,
        norte: m.key === norte.key,
        valores: outras.map((r) => num(r, `mde_${m.col}`)),
      })),
    },
    roadmap: vinculos(extra.vinculos, campanha),
  };
}
