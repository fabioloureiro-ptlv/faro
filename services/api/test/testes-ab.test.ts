import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResultsRow } from '../src/resultados/roadmap/types.ts';
import { createResultsSource } from '../src/resultados/roadmap/source.ts';
import { detalharDy, listarDy, recomendar } from '../src/testes-ab/dy.ts';
import { METRICAS, metricaPorKey, significancia, statusDe } from '../src/testes-ab/metricas.ts';
import { carregarRoadmap, vinculosPorCampanha } from '../src/testes-ab/roadmap.ts';
import { PM, setup, type Ctx } from './helpers.ts';

const linha = (over: Record<string, unknown>): ResultsRow =>
  ({
    dados_ate: '2026-10-14', grao: 'usuario', stream: 'app', bu: 'ecom', device: 'Total', status: 'saudavel',
    metrica_norte: 'ticket', dias_leitura: 16, usuarios_2_variantes: 0, origem_datas: 'roadmap',
    ...over,
  }) as ResultsRow;

const CAMPANHA = '[FIDE] Modal de variantes - Novo layout do card catálogo - APP';
const rows: ResultsRow[] = [
  linha({ campanha: CAMPANHA, variacao: 'Controle', is_controle: true, unidades: 1000, share_unidades: 0.34, ticket: 220, receita_por_unidade: 143, uplift_ticket: 0, p_vence_ticket: 0.5 }),
  linha({
    campanha: CAMPANHA, variacao: 'Variante B', is_controle: false, unidades: 990, share_unidades: 0.33, ticket: 222, receita_por_unidade: 146,
    uplift_ticket: 0.008, ic_lo_ticket: -0.01, ic_hi_ticket: 0.03, p_vence_ticket: 0.78, mde_ticket: 0.032, chance_melhor_ticket: 0.76,
    uplift_esperado_ticket: 0.007, perda_ligar_ticket: 0.0014, recomendacao_ticket: 'Continuar coletando',
    uplift_receita_por_unidade: 0.016, p_vence_receita_por_unidade: 0.88,
  }),
  linha({
    campanha: CAMPANHA, variacao: 'Variante C', is_controle: false, unidades: 995, share_unidades: 0.33, ticket: 222, receita_por_unidade: 147,
    uplift_ticket: 0.0079, p_vence_ticket: 0.77, chance_melhor_ticket: 0.74, recomendacao_ticket: 'Continuar coletando',
    uplift_receita_por_unidade: 0.029, p_vence_receita_por_unidade: 0.98, confirmado_receita_por_unidade: true,
  }),
  linha({ campanha: CAMPANHA, device: 'Android', variacao: 'Controle', is_controle: true, unidades: 500, ticket: 221 }),
  linha({ campanha: CAMPANHA, device: 'Android', variacao: 'Variante B', is_controle: false, unidades: 480, ticket: 222, uplift_ticket: 0, p_vence_ticket: 0.4 }),
  // teste decidido (uma variante com quase todo o tráfego) e um da web
  linha({ campanha: 'Nexus | Nova Home do App', bu: 'cross', variacao: 'home antiga', is_controle: true, status: 'decidido', unidades: 20, share_unidades: 0.02, receita_por_unidade: 21 }),
  linha({ campanha: 'Nexus | Nova Home do App', bu: 'cross', variacao: 'home nova', is_controle: false, status: 'decidido', unidades: 980, share_unidades: 0.98, receita_por_unidade: 22, uplift_receita_por_unidade: 0.04, p_vence_receita_por_unidade: 0.9 }),
  linha({ campanha: 'Teste web', stream: 'web', variacao: 'Controle', is_controle: true, status: 'split desigual', unidades: 50, receita_por_unidade: 10 }),
  linha({ campanha: 'Teste web', stream: 'web', variacao: 'B', is_controle: false, status: 'split desigual', unidades: 70, receita_por_unidade: 9, uplift_receita_por_unidade: -0.1, p_vence_receita_por_unidade: 0.03 }),
  // grão sessão não entra na lista de usuário
  linha({ grao: 'sessao', campanha: CAMPANHA, variacao: 'Controle', is_controle: true, unidades: 5000 }),
];

describe('métricas, significância e status', () => {
  it('são 16 métricas, com churn de menor-é-melhor', () => {
    expect(METRICAS).toHaveLength(16);
    expect(METRICAS.filter((m) => m.menorMelhor).map((m) => m.key)).toEqual(['clube_churn', 'saude_churn']);
    expect(new Set(METRICAS.map((m) => m.col)).size).toBe(16);
  });

  it('faixas de significância da especificação (95/85/15/5)', () => {
    const f = (p: number) => significancia(p)?.rotulo;
    expect(f(0.98)).toBe('Melhora confirmada');
    expect(f(0.93)).toBe('Tendência de melhora');
    expect(f(0.71)).toBe('Sem tendência');
    expect(f(0.08)).toBe('Tendência de queda');
    expect(f(0.0)).toBe('Queda confirmada');
    expect(significancia(null)).toBeNull();
  });

  it('status do snapshot vira chave estável', () => {
    expect(statusDe('split desigual').key).toBe('split_desigual');
    expect(statusDe('volume baixo').key).toBe('volume_baixo');
    expect(statusDe('decidido').tom).toBe('muted');
  });
});

describe('Rodando no DY — lista', () => {
  it('uma linha por teste no grão e device consolidado, ordenada pela base', () => {
    const l = listarDy(rows, { metrica: 'ticket' });
    expect(l.testes.map((t) => t.campanha)).toEqual([CAMPANHA, 'Nexus | Nova Home do App', 'Teste web']);
    const t = l.testes[0]!;
    expect(t).toMatchObject({ base: 2985, unidade: 'usuários', variantes: 3, controle: 220, split: '34/33/33', cross: false });
    expect(t.melhor?.nome).toBe('Variante B');
    expect(t.cmp?.sig?.rotulo).toBe('Sem tendência');
  });

  it('KPIs e contagem por status; decidido não compara; confirmado é melhora confirmada em teste saudável', () => {
    const l = listarDy(rows, { metrica: 'rpu' });
    expect(l.kpis).toEqual({ testes: 3, splitValido: 1, decididosLigados: 1, confirmados: 1 });
    expect(l.statusContagem).toEqual({ saudavel: 1, split_desigual: 1, volume_baixo: 0, decidido: 1 });
    const nexus = l.testes.find((t) => t.campanha.startsWith('Nexus'))!;
    expect(nexus.cmp).toBeNull();
    expect(nexus.cross).toBe(true);
    expect(l.testes.find((t) => t.campanha === CAMPANHA)?.melhor?.nome).toBe('Variante C');
    const pior = rows.map((r) => (r.variacao === 'Variante C' ? ({ ...r, uplift_receita_por_unidade: -0.03 } as ResultsRow) : r));
    expect(listarDy(pior, { metrica: 'rpu' }).kpis.confirmados).toBe(0);
  });

  it('filtra por stream e troca para sessão', () => {
    expect(listarDy(rows, { stream: 'web' }).testes.map((t) => t.campanha)).toEqual(['Teste web']);
    expect(listarDy(rows, { grao: 'sessao' }).testes.map((t) => t.base)).toEqual([5000]);
  });
});

describe('Rodando no DY — detalhe', () => {
  it('traz variantes, síntese, recomendação, tabelas por device e MDE', () => {
    const cadastro = carregarRoadmap();
    const d = detalharDy(rows, CAMPANHA, 'app', 'usuario', { teste: cadastro.testes.find((t) => t.id === 6)!, vinculos: vinculosPorCampanha(cadastro.testes) })!;
    expect(d.variantes.map((v) => v.nome)).toEqual(['Controle', 'Variante B', 'Variante C']);
    expect(d.variantes[1]?.descricao).toContain('Destaque');
    expect(d.norte.key).toBe('ticket');
    expect(d.sintese.map((s) => s.variante)).toEqual(['Variante B', 'Variante C']);
    expect(d.sintese[0]?.itens.map((i) => [i.rotulo, i.norte])).toEqual([['Ticket médio', true], ['Conversão', false], ['Receita por unidade', false]]);
    expect(d.recomendacao).toMatchObject({ titulo: 'Continuar coleta', tom: 'warn' });
    expect(d.recomendacao.texto).toContain('76% de chance de Variante B ser melhor em ticket médio');
    expect(d.tabelas.map((t) => t.rotulo)).toEqual(['Consolidado', 'Android']);
    const ticket = d.tabelas[0]!.linhas.find((l) => l.chave === 'ticket')!;
    expect(ticket.papel).toBe('norte');
    expect(ticket.celulas[1]).toMatchObject({ valor: 222, uplift: 0.008 });
    expect(d.mde.linhas.find((l) => l.norte)?.valores[0]).toBe(0.032);
    expect(d.roadmap.atrelados).toEqual([6]);
    expect(d.squad).toBe('Fidelidade');
  });

  it('grupo saúde só aparece em teste da BU saúde', () => {
    const d = detalharDy(rows, CAMPANHA, 'app', 'usuario')!;
    expect(d.tabelas[0]!.linhas.some((l) => l.grupo === 'saude')).toBe(false);
    const s = detalharDy(rows.map((r) => ({ ...r, bu: 'saude' }) as ResultsRow), CAMPANHA, 'app', 'usuario')!;
    expect(s.tabelas[0]!.linhas.some((l) => l.grupo === 'saude')).toBe(true);
  });

  it('teste inexistente devolve null', () => {
    expect(detalharDy(rows, 'nao existe', 'app', 'usuario')).toBeNull();
  });

  it('recomendação por texto da consulta', () => {
    const m = metricaPorKey('ticket');
    const v = rows[1]!;
    expect(recomendar(m, { ...v, recomendacao_ticket: 'Ligar variante' } as ResultsRow).titulo).toBe('Ligar Variante B');
    expect(recomendar(m, { ...v, recomendacao_ticket: 'Não ligar: piora conversao' } as ResultsRow)).toMatchObject({ titulo: 'Não ligar', tom: 'risk' });
    expect(recomendar(m, { ...v, recomendacao_ticket: 'Aguardar (volume baixo)' } as ResultsRow)).toMatchObject({ titulo: 'Aguardar', tom: 'info' });
    expect(recomendar(m, undefined).titulo).toBe('Sem dado');
  });
});

describe('cadastro dos testes do roadmap', () => {
  it('são 21 testes, ids únicos, com os contadores do documento', () => {
    const c = carregarRoadmap();
    expect(c.testes).toHaveLength(21);
    expect(new Set(c.testes.map((t) => t.id)).size).toBe(21);
    const por = (s: string) => c.testes.filter((t) => t.status === s).length;
    expect([por('rodando'), por('pronto'), por('desenhando'), por('concluido')]).toEqual([7, 1, 9, 4]);
  });

  it('os vínculos injetados na consulta apontam para testes existentes', () => {
    const c = carregarRoadmap();
    const ids = new Set(c.testes.map((t) => t.id));
    expect(c.overrides).toHaveLength(10);
    expect(c.overrides.every((o) => ids.has(o.teste))).toBe(true);
    const atreladas = c.overrides.map((o) => o.campanha).sort();
    expect(atreladas).toEqual(c.testes.flatMap((t) => t.campanhasDy).sort());
  });
});

describe('rotas /testes-ab', () => {
  let ctx: Ctx;
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'faro-testes-ab-'));
  });
  afterEach(async () => ctx?.close());

  it('sem snapshot: resumo avisa e as listas respondem 409 com a orientação', async () => {
    ctx = await setup();
    const r = await ctx.app.inject({ url: '/testes-ab/resumo', headers: PM });
    expect(r.json()).toMatchObject({ disponivel: false, contagens: { roadmap: 21, dy: 0 } });
    const l = await ctx.app.inject({ url: '/testes-ab/dy', headers: PM });
    expect(l.statusCode).toBe(409);
    expect(l.json().error).toBe('sem_snapshot');
    const rm = await ctx.app.inject({ url: '/testes-ab/roadmap', headers: PM });
    expect(rm.statusCode).toBe(200);
    expect(rm.json().contadores).toEqual({ desenhando: 9, pronto: 1, rodando: 7, concluido: 4 });
  });

  it('com snapshot: lista, detalhe e selo do roadmap saem dos mesmos números', async () => {
    const file = join(dir, 'results.json');
    writeFileSync(file, JSON.stringify({ generatedAt: '2026-10-15T09:22:00Z', rows }));
    ctx = await setup({ resultsSource: createResultsSource({ source: 'roadmap', resultsFile: file, root: dir }) });

    const l = await ctx.app.inject({ url: '/testes-ab/dy?metrica=ticket', headers: PM });
    expect(l.statusCode).toBe(200);
    expect(l.json().testes[0]).toMatchObject({ campanha: CAMPANHA, roadmap: { atrelados: [6], relacionados: [] } });

    const d = await ctx.app.inject({ url: `/testes-ab/dy/detalhe?campanha=${encodeURIComponent(CAMPANHA)}&stream=app`, headers: PM });
    expect(d.statusCode).toBe(200);
    expect(d.json().recomendacao.titulo).toBe('Continuar coleta');
    expect((await ctx.app.inject({ url: '/testes-ab/dy/detalhe?campanha=x&stream=app', headers: PM })).statusCode).toBe(404);
    expect((await ctx.app.inject({ url: '/testes-ab/dy?grao=outro', headers: PM })).statusCode).toBe(400);

    const rm = (await ctx.app.inject({ url: '/testes-ab/roadmap', headers: PM })).json();
    const t6 = rm.testes.find((t: { id: number }) => t.id === 6);
    expect(t6.dy.atrelado).toBe(true);
    expect(t6.dy.resultado).toMatchObject({ variante: 'Variante B', metrica: 'Ticket médio' });
    const t26 = rm.testes.find((t: { id: number }) => t.id === 26);
    expect(t26.avisos).toEqual(['falta indicador', 'cenários']);
    const rodando = rm.testes.find((t: { id: number }) => t.id === 3);
    expect(rodando.diasEmCampo).toBe(16); // 29/09 → 14/10, inclusive

    const c = (await ctx.app.inject({ url: '/testes-ab/consultas', headers: PM })).json();
    expect(c.consultas.map((q: { id: string }) => q.id)).toEqual(['results', 'discovery', 'daily']);
    expect(c.consultas[0]).toMatchObject({ salva: true, ultimaExecucao: { linhas: rows.length } });
    expect(c.consultas[1]).toMatchObject({ salva: false, ultimaExecucao: null });
    expect(c.injetado).toHaveLength(10);

    const sql = await ctx.app.inject({ url: '/testes-ab/consultas/results/sql', headers: PM });
    expect(sql.statusCode).toBe(200);
    expect(sql.headers['content-type']).toContain('text/plain');
    expect((await ctx.app.inject({ url: '/testes-ab/consultas/discovery/sql', headers: PM })).statusCode).toBe(404);
    expect((await ctx.app.inject({ url: '/testes-ab/consultas/outra/sql', headers: PM })).statusCode).toBe(404);
  });
});
