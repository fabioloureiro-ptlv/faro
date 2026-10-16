// Visão Geral — números-chave de uma campanha do DY, no mesmo formato do detalhe do painel
// (ResultsResponse do adapter da fonte roadmap). A campanha vira um experimento "descoberto"
// (discoverExperiments) e o adapter monta volumes, SRM, contaminação, síntese e recomendação a
// partir das linhas da dy_results. A métrica principal vem do cadastro do roadmap quando a campanha
// está atrelada a um teste; senão, da coluna metrica_norte da consulta.
import {
  ROADMAP_METRIC_TO_FARO,
  type Grain,
  type MetricDefinition,
  type Platform,
  type ResultsResponse,
} from '@faro/contracts';
import { buildResults, discoverExperiments } from '../resultados/roadmap/adapter.ts';
import type { RoadmapSnapshot } from '../resultados/roadmap/types.ts';
import { metricaPorKey } from './metricas.ts';
import { vinculosPorCampanha, type CadastroRoadmap } from './roadmap.ts';

export interface ResultadoCampanha {
  results: ResultsResponse;
  primaryMetricId: string;
  norte?: Pick<MetricDefinition, 'id' | 'name' | 'unit' | 'direction'>;
}

export interface OpcoesResultado {
  campanha: string;
  stream: 'web' | 'app';
  grain: Grain;
  platform: Platform | 'all';
}

export type RespostaResultado =
  | { ok: true; resultado: ResultadoCampanha }
  | { ok: false; erro: 'nao_encontrado' | 'grao_sem_variantes' };

const norm = (s: string) => s.trim().toLowerCase();

export function resultadoDaCampanha(
  snap: RoadmapSnapshot,
  cadastro: CadastroRoadmap,
  catalog: MetricDefinition[],
  opts: OpcoesResultado,
): RespostaResultado {
  const exp = discoverExperiments(snap, []).find((e) => norm(e.name) === norm(opts.campanha));
  if (!exp) return { ok: false, erro: 'nao_encontrado' };

  // O adapter precisa de controle + variante no grão pedido (SRM, deltas); sem isso, avisa em vez de quebrar.
  const grao = opts.grain === 'session' ? 'sessao' : 'usuario';
  const variantes = new Set(
    snap.results
      .filter(
        (r) => norm(r.campanha) === norm(exp.name) && r.stream === opts.stream && r.grao === grao,
      )
      .map((r) => r.variacao),
  );
  if (variantes.size < 2) return { ok: false, erro: 'grao_sem_variantes' };

  // Teste do roadmap atrelado: a métrica principal cadastrada lá prevalece sobre a coluna da consulta.
  const idTeste = vinculosPorCampanha(cadastro.testes).get(exp.name)?.atrelados[0];
  const teste = idTeste ? cadastro.testes.find((t) => t.id === idTeste) : undefined;
  const doRoadmap = teste?.metricaNorte
    ? ROADMAP_METRIC_TO_FARO[metricaPorKey(teste.metricaNorte).col]
    : undefined;
  const primaryMetricId = doRoadmap ?? exp.design.primaryMetricId;

  // O stream pedido manda nas plataformas lidas (uma campanha pode ter web e app no snapshot).
  const platforms: Platform[] = opts.stream === 'app' ? ['android', 'ios'] : ['site'];
  const comStream = {
    ...exp,
    design: { ...exp.design, primaryMetricId },
    allocation: { ...exp.allocation, platforms },
  };
  const results = buildResults(snap, comStream, catalog, {
    grain: opts.grain,
    platform: opts.platform,
  });
  if (!results) return { ok: false, erro: 'nao_encontrado' };

  const m = catalog.find((x) => x.id === primaryMetricId);
  return {
    ok: true,
    resultado: {
      results,
      primaryMetricId,
      ...(m ? { norte: { id: m.id, name: m.name, unit: m.unit, direction: m.direction } } : {}),
    },
  };
}
