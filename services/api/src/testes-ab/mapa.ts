// Mapa temporal só com o que existe na DY: uma barra por campanha do snapshot de resultados (as mesmas
// da aba "Rodando no DY"), sem ler nenhum experimento cadastrado no Faro. A página vem do export da DY
// (pelo nome da campanha); campanha sem página identificada vai para uma linha própria no Mapa.
import type { PageDefinition } from '@faro/contracts';
import { BU_BY_COL } from '../resultados/roadmap/adapter.ts';
import type { ResultsRow } from '../resultados/roadmap/types.ts';
import { chaveTeste } from './dy.ts';
import { statusDe, type StatusTeste } from './metricas.ts';

export const PAGINA_SEM_ID = 'sem_pagina';

export interface TesteNoMapa {
  key: string;
  campanha: string;
  stream: 'web' | 'app';
  /** Mesmos valores de BU do painel (ecom, saude, ecossistema…). */
  bu: ReturnType<typeof BU_BY_COL>;
  status: Pick<StatusTeste, 'key' | 'rotulo'>;
  /** Janela de leitura da consulta: primeiro início e último fim entre as linhas do teste. */
  inicio: string;
  fim: string;
  /** Ids do catálogo de páginas; vazio quando o export da DY não identifica a página. */
  paginas: string[];
  base: number;
}

export interface MapaDy {
  dadosAte: string;
  paginas: PageDefinition[];
  testes: TesteNoMapa[];
}

export function mapaDy(
  rows: ResultsRow[],
  dadosAte: string,
  paginasPorCampanha: Map<string, { pages: string[] }>,
  catalogo: PageDefinition[],
): MapaDy {
  const grupos = new Map<string, ResultsRow[]>();
  for (const r of rows) (grupos.get(chaveTeste(r)) ?? grupos.set(chaveTeste(r), []).get(chaveTeste(r))!).push(r);

  const ids = new Set(catalogo.map((p) => p.id));
  const testes: TesteNoMapa[] = [];
  for (const [key, todas] of grupos) {
    const total = todas.filter((r) => r.grao === 'usuario' && r.device === 'Total');
    const ref = total.find((r) => r.is_controle) ?? total[0];
    if (!ref) continue;
    const inicios = todas.map((r) => r.data_inicio_leitura).filter((d): d is string => !!d).sort();
    const fins = todas.map((r) => r.data_fim_leitura).filter((d): d is string => !!d).sort();
    const status = statusDe(ref.status);
    testes.push({
      key,
      campanha: ref.campanha,
      stream: ref.stream,
      bu: BU_BY_COL(ref.bu ?? ''),
      status: { key: status.key, rotulo: status.rotulo },
      inicio: inicios[0] ?? dadosAte,
      fim: fins.at(-1) ?? dadosAte,
      // Só páginas que existem no catálogo viram linha; o resto cai em "Página não identificada".
      paginas: (paginasPorCampanha.get(ref.campanha.trim().toLowerCase())?.pages ?? []).filter((p) => ids.has(p)),
      base: total.reduce((s, r) => s + (r.unidades ?? 0), 0),
    });
  }
  testes.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.campanha.localeCompare(b.campanha, 'pt-BR'));

  return {
    dadosAte,
    paginas: [...catalogo, { id: PAGINA_SEM_ID, name: 'Página não identificada', dailyUsers: 0 }],
    testes,
  };
}
