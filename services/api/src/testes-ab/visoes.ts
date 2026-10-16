// Aba Teste AB — as visões prontas para a tela: resumo, testes do roadmap com o resultado do DY
// ao lado, e as consultas. A lista "Rodando no DY" e o detalhe ficam em dy.ts.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUERY_FILES, REPO_ROOT } from '../resultados/roadmap/paths.ts';
import type { RoadmapSnapshot, ResultsRow } from '../resultados/roadmap/types.ts';
import { comparar, listarDy, melhorVariante, type Comparacao } from './dy.ts';
import { metricaPorKey } from './metricas.ts';
import { STATUS_ROADMAP, vinculosPorCampanha, type CadastroRoadmap, type StatusRoadmap, type TesteRoadmap } from './roadmap.ts';

const DIA = 86_400_000;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA);

export interface Resumo {
  disponivel: boolean;
  dadosAte: string | null;
  buscadoEm: string | null;
  fonte: string;
  contagens: { roadmap: number; dy: number };
}

export function resumo(cadastro: CadastroRoadmap, snap: RoadmapSnapshot | undefined): Resumo {
  return {
    disponivel: !!snap,
    dadosAte: snap?.meta.dadosAte ?? null,
    buscadoEm: snap?.meta.fetchedAt ?? null,
    fonte: snap ? 'consultas do roadmap (dy_results)' : 'sem snapshot',
    contagens: { roadmap: cadastro.testes.length, dy: snap ? listarDy(snap.results, {}).kpis.testes : 0 },
  };
}

export interface TesteRoadmapView extends TesteRoadmap {
  /** Dias em campo, só para teste rodando (início até o último dia de dados, inclusive). */
  diasEmCampo?: number;
  avisos: string[];
  dy: {
    atrelado: boolean;
    campanhas: string[];
    /** Melhor variante na métrica norte da campanha atrelada de maior base (grão usuário, consolidado). */
    resultado?: { campanha: string; stream: 'web' | 'app'; variante: string; metrica: string; cmp: Comparacao };
  };
}

export interface RoadmapView {
  contadores: Record<StatusRoadmap, number>;
  indicadores: { rotulo: string; quantidade: number }[];
  testes: TesteRoadmapView[];
}

function resultadoDy(teste: TesteRoadmap, results: ResultsRow[]): TesteRoadmapView['dy']['resultado'] {
  const m = metricaPorKey(teste.metricaNorte);
  // DECISAO-PENDENTE: o roadmap soma duas campanhas (ex.: iOS + Android) estratificando pelas variâncias da
  // consulta; aqui vale a campanha de maior base, para o selo não depender dessa combinação.
  const candidatos = teste.campanhasDy.flatMap((campanha) => {
    const lista = listarDy(results.filter((r) => r.campanha === campanha), { metrica: m.key });
    return lista.testes.map((t) => ({ campanha, t }));
  });
  const principal = candidatos.sort((a, b) => b.t.base - a.t.base)[0];
  if (!principal) return undefined;
  const total = results.filter((r) => r.campanha === principal.campanha && r.stream === principal.t.stream && r.grao === 'usuario' && r.device === 'Total');
  const outras = total.filter((r) => !r.is_controle);
  const melhor = principal.t.status.key === 'decidido' ? null : melhorVariante(outras, m);
  const cmp = melhor?.cmp ?? (outras[0] ? comparar(outras[0], m) : null);
  return cmp && melhor ? { campanha: principal.campanha, stream: principal.t.stream, variante: melhor.row.variacao, metrica: m.label, cmp } : undefined;
}

export function visaoRoadmap(cadastro: CadastroRoadmap, snap: RoadmapSnapshot | undefined): RoadmapView {
  const contadores = Object.fromEntries(STATUS_ROADMAP.map((s) => [s, 0])) as Record<StatusRoadmap, number>;
  const indicadores = new Map<string, number>();

  const testes = cadastro.testes.map<TesteRoadmapView>((t) => {
    contadores[t.status] += 1;
    if (t.indicador) indicadores.set(t.indicador, (indicadores.get(t.indicador) ?? 0) + 1);
    const avisos = t.indicador ? [] : ['falta indicador', ...(t.cenarios?.length ? [] : ['cenários'])];
    const resultado = snap ? resultadoDy(t, snap.results) : undefined;
    return {
      ...t,
      ...(t.status === 'rodando' && t.dataInicio && snap ? { diasEmCampo: diasEntre(t.dataInicio, snap.meta.dadosAte) + 1 } : {}),
      avisos,
      dy: { atrelado: t.campanhasDy.length > 0, campanhas: t.campanhasDy, ...(resultado ? { resultado } : {}) },
    };
  });

  return {
    contadores,
    indicadores: [...indicadores].map(([rotulo, quantidade]) => ({ rotulo, quantidade })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    testes,
  };
}

export { vinculosPorCampanha };

// ---------------------------------------------------------------- consultas

export const CONSULTAS = [
  {
    id: 'results',
    nome: 'Resultados',
    arquivo: QUERY_FILES.results,
    custo: '~10 GB',
    descricao:
      'Uma linha por teste × grão × device × variante, com 16 métricas (eCom, clube e saúde), uplift contra o controle, IC 95%, P(vence), MDE, selo de confirmado corrigido pela multiplicidade e leitura bayesiana com recomendação. Recebe datas de leitura, controle e métrica norte do roadmap e segue lendo a campanha atrelada depois que sai do ar. Alimenta: lista de testes rodando, detalhe e selo do card do roadmap.',
  },
  {
    id: 'discovery',
    nome: 'Descoberta',
    arquivo: QUERY_FILES.discovery,
    custo: '~10 GB',
    descricao:
      'Toda campanha com exposição nos últimos 7 dias, com BU, split, período de split estável, estado e flag de teste novo. Alimenta: campanhas descobertas, dropdown de campanhas do teste e sugestões de cadastro.',
  },
  {
    id: 'daily',
    nome: 'Série diária',
    arquivo: QUERY_FILES.daily,
    custo: '~7 GB',
    descricao:
      'Por dia e variante, usuários novos e compras da janela de leitura, mesmo escopo e datas da consulta de resultados. Somada até o último dia, bate com o grão usuário. Alimenta: gráfico de exposição por dia, métrica norte acumulada e os dias que faltam no "Continuar coleta".',
  },
] as const;

export type ConsultaId = (typeof CONSULTAS)[number]['id'];

export function visaoConsultas(cadastro: CadastroRoadmap, snap: RoadmapSnapshot | undefined, root = REPO_ROOT) {
  const linhas: Record<ConsultaId, number | null> = {
    results: snap?.results.length ?? null,
    discovery: snap?.discovery.length ? snap.discovery.length : null,
    daily: snap?.daily.length ? snap.daily.length : null,
  };
  const nomes = new Map(cadastro.testes.map((t) => [t.id, t.nome]));
  return {
    consultas: CONSULTAS.map((c) => ({
      ...c,
      salva: existsSync(resolve(root, c.arquivo)),
      ultimaExecucao: linhas[c.id] != null && snap ? { geradoEm: snap.meta.fetchedAt, linhas: linhas[c.id], dadosAte: snap.meta.dadosAte, versao: c.id === 'results' ? snap.meta.sqlVersion : null } : null,
    })),
    injetado: cadastro.overrides.map((o) => ({ ...o, testeNome: nomes.get(o.teste) ?? null })),
  };
}
