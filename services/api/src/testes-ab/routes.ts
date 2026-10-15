// Aba Teste AB (experimental): testes do roadmap Digital, o que roda no DY e as consultas por trás.
// Lê o mesmo snapshot do painel (consulta dy_results do roadmap); sem snapshot, avisa em vez de inventar.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../errors.ts';
import { requireActor } from '../http.ts';
import { pagesFromCatalog, paginasDoExportDy } from '../painel/dataset.ts';
import { REPO_ROOT } from '../resultados/roadmap/paths.ts';
import { getResultsSource } from '../resultados/roadmap/source.ts';
import { detalharDy, listarDy } from './dy.ts';
import { METRICAS } from './metricas.ts';
import { mapaDy } from './mapa.ts';
import { carregarRoadmap, vinculosPorCampanha } from './roadmap.ts';
import { CONSULTAS, resumo, visaoConsultas, visaoRoadmap } from './visoes.ts';

const ListaQuery = z.object({
  grao: z.enum(['usuario', 'sessao']).default('usuario'),
  stream: z.enum(['todos', 'web', 'app']).default('todos'),
  metrica: z.string().optional(),
});
const DetalheQuery = z.object({
  campanha: z.string().min(1),
  stream: z.enum(['web', 'app']),
  grao: z.enum(['usuario', 'sessao']).default('usuario'),
});

function snapshot() {
  const snap = getResultsSource().snapshot();
  if (!snap) throw new HttpError(409, 'sem_snapshot', 'Ainda não há dados do DY nesta máquina: rode npm run job:sync-results (ou use o botão Atualizar da DY no Acompanhamento).');
  return snap;
}

export async function testesAbRoutes(app: FastifyInstance) {
  app.get('/testes-ab/resumo', async (req) => {
    requireActor(req);
    return resumo(carregarRoadmap(), getResultsSource().snapshot());
  });

  app.get('/testes-ab/roadmap', async (req) => {
    requireActor(req);
    return visaoRoadmap(carregarRoadmap(), getResultsSource().snapshot());
  });

  app.get('/testes-ab/dy', async (req) => {
    requireActor(req);
    const q = ListaQuery.parse(req.query);
    const snap = snapshot();
    const cadastro = carregarRoadmap();
    const catalogo = pagesFromCatalog();
    // Squad de cada campanha atrelada ao roadmap.
    const squads = new Map(cadastro.testes.flatMap((t) => (t.squad ? t.campanhasDy.map((c) => [c, t.squad!] as const) : [])));
    const lista = listarDy(snap.results, {
      ...q,
      vinculos: vinculosPorCampanha(cadastro.testes),
      paginas: paginasDoExportDy(),
      paginasValidas: new Set(catalogo.map((p) => p.id)),
      squads,
    });
    return {
      ...lista,
      metricas: METRICAS.map((m) => ({ key: m.key, label: m.label })),
      paginasCatalogo: catalogo.map((p) => ({ id: p.id, name: p.name })),
      dadosAte: snap.meta.dadosAte,
    };
  });

  app.get('/testes-ab/dy/detalhe', async (req) => {
    requireActor(req);
    const q = DetalheQuery.parse(req.query);
    const snap = snapshot();
    const cadastro = carregarRoadmap();
    const vinculos = vinculosPorCampanha(cadastro.testes);
    const idPrincipal = vinculos.get(q.campanha)?.atrelados[0];
    const teste = idPrincipal ? cadastro.testes.find((t) => t.id === idPrincipal) : undefined;
    const detalhe = detalharDy(snap.results, q.campanha, q.stream, q.grao, { ...(teste ? { teste } : {}), vinculos });
    if (!detalhe) throw new HttpError(404, 'nao_encontrado', 'Teste não encontrado no snapshot do DY.');
    return detalhe;
  });

  // Mapa temporal: só campanhas da DY, nunca os experimentos cadastrados no Faro.
  app.get('/testes-ab/mapa', async (req) => {
    requireActor(req);
    const snap = snapshot();
    return mapaDy(snap.results, snap.meta.dadosAte, paginasDoExportDy(), pagesFromCatalog());
  });

  app.get('/testes-ab/consultas', async (req) => {
    requireActor(req);
    return visaoConsultas(carregarRoadmap(), getResultsSource().snapshot());
  });

  app.get<{ Params: { id: string } }>('/testes-ab/consultas/:id/sql', async (req, reply) => {
    requireActor(req);
    const consulta = CONSULTAS.find((c) => c.id === req.params.id);
    if (!consulta) throw new HttpError(404, 'nao_encontrado', 'Consulta desconhecida.');
    try {
      const sql = readFileSync(resolve(REPO_ROOT, consulta.arquivo), 'utf8');
      return reply.type('text/plain; charset=utf-8').send(sql);
    } catch {
      throw new HttpError(404, 'consulta_nao_salva', `A consulta ainda não foi salva em ${consulta.arquivo}.`);
    }
  });
}
