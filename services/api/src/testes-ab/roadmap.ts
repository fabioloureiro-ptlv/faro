// Aba Teste AB — cadastro dos testes do roadmap Digital (data/testes-ab/testes-roadmap.json), só leitura
// por enquanto, e o vínculo teste ↔ campanha do DY que o roadmap injeta na consulta de resultados.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from '../resultados/roadmap/paths.ts';

export const STATUS_ROADMAP = ['desenhando', 'pronto', 'rodando', 'concluido'] as const;
export type StatusRoadmap = (typeof STATUS_ROADMAP)[number];

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const testeSchema = z.object({
  id: z.number().int().positive(),
  nome: z.string().min(1),
  status: z.enum(STATUS_ROADMAP),
  dataInicio: data.optional(),
  indicador: z.string().optional(),
  metricaNorte: z.string().optional(),
  squad: z.string().optional(),
  /** DECISAO-PENDENTE: o roadmap Digital é todo de eCom (squads Fidelidade e Aquisição); sem BU no cadastro, vale ecom. */
  bu: z.enum(['ecom', 'saude', 'fintech', 'servicos', 'ecossistema']).default('ecom'),
  iniciativa: z.string().optional(),
  campanhasDy: z.array(z.string()).default([]),
  campanhasRelacionadas: z.array(z.string()).optional(),
  cenarios: z.array(z.object({ nome: z.string(), descricao: z.string(), rollout: z.boolean().optional() })).optional(),
  contexto: z.string().optional(),
  documentacao: z.string().url().optional(),
  temAcompanhamento: z.boolean().optional(),
  resumo: z.string().optional(),
  decisao: z.object({ variante: z.string(), data }).optional(),
  midias: z.number().int().optional(),
});

const overrideSchema = z.object({
  campanha: z.string(),
  inicio: data.nullable(),
  fim: data.nullable(),
  controle: z.string().nullable(),
  norte: z.string(),
  teste: z.number().int(),
});

const arquivoSchema = z.object({
  origem: z.string(),
  nota: z.string().optional(),
  overrides: z.array(overrideSchema),
  testes: z.array(testeSchema),
});

export type TesteRoadmap = z.infer<typeof testeSchema>;
export type OverrideRoadmap = z.infer<typeof overrideSchema>;
export type CadastroRoadmap = z.infer<typeof arquivoSchema>;

/** FARO_TESTES_AB_PATH existe para os testes apontarem para um cadastro próprio. */
export const ROADMAP_TESTES_PATH = () => process.env.FARO_TESTES_AB_PATH ?? resolve(REPO_ROOT, 'data/testes-ab/testes-roadmap.json');

export function carregarRoadmap(path = ROADMAP_TESTES_PATH()): CadastroRoadmap {
  return arquivoSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export interface Vinculo {
  /** Testes cujo cadastro está atrelado à campanha (o roadmap injeta o override na consulta). */
  atrelados: number[];
  /** Testes que citam a campanha mas não estão atrelados a ela. */
  relacionados: number[];
}

export function vinculosPorCampanha(testes: TesteRoadmap[]): Map<string, Vinculo> {
  const map = new Map<string, Vinculo>();
  const get = (c: string) => map.get(c) ?? map.set(c, { atrelados: [], relacionados: [] }).get(c)!;
  for (const t of testes) {
    for (const c of t.campanhasDy) get(c).atrelados.push(t.id);
    for (const c of t.campanhasRelacionadas ?? []) get(c).relacionados.push(t.id);
  }
  return map;
}
