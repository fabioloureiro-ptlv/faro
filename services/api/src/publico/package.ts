// Frente 3 — pacote de segmento: a saída da skill `criar-segmento-faro` e a entrada da aba Segmentos.
// O pacote traz a entrada do catálogo (nome, parâmetros, atributo na DY) e a query. Nada do que o
// pacote afirma é aceito sem conferir: a guarda estática do SQL, os parâmetros declarados contra os
// usados e, com BigQuery disponível, o dry run (compila e devolve `cuid`) e a contagem de uma
// linha por cliente com cuid não nulo.
import { z } from 'zod';
import {
  AudienceParameterSchema,
  AudienceShortcutSchema,
  resolveAudienceParams,
  type AudienceShortcut,
} from '@faro/contracts';
import { BASE_CLIENTES } from './import.ts';
import { guardAudienceSql, stripSqlNoise } from './sql-guard.ts';

export const SegmentPackageSchema = z.object({
  versao: z.literal(1, { error: 'Pacote da versão 1 esperado (campo "versao": 1).' }),
  segmento: z.object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id em kebab-case (letras minúsculas, números e hífens)').max(48),
    name: z.string().trim().min(4, 'Nome com pelo menos 4 caracteres.').max(80),
    share: z.number().min(0).max(1).optional(),
    dyAttribute: z.string().regex(/^faro_aud_[a-z0-9_]+$/, 'atributo no formato faro_aud_<nome_em_snake_case>').optional(),
    parameters: z.array(AudienceParameterSchema).optional(),
    descricao: z.string().max(300).optional(),
  }),
  // A query pode vir como texto ou como lista de linhas (mais legível dentro do JSON).
  sql: z.union([z.string(), z.array(z.string())]).transform((s) => (Array.isArray(s) ? s.join('\n') : s)),
});

export type SegmentPackage = z.infer<typeof SegmentPackageSchema>;

export interface Verificacao {
  id: string;
  rotulo: string;
  status: 'ok' | 'erro' | 'aviso' | 'pulado';
  detalhe?: string;
}

export interface PackageRunner {
  /** Compila a query sem executá-la: custo e colunas do resultado. Lança o erro do BigQuery. */
  dryRun(sql: string, params: Record<string, number>): Promise<{ gigabytes: number; colunas: string[] }>;
  /** Contagem do grão: linhas, clientes distintos e linhas sem cuid. */
  count(sql: string, params: Record<string, number>): Promise<{ linhas: number; clientes: number; semCuid: number }>;
}

export interface CheckResult {
  ok: boolean;
  verificacoes: Verificacao[];
  resumo?: { id: string; name: string; dyAttribute: string; share?: number; clientes?: number; gigabytes?: number; parameters: string[] };
  /** O atalho pronto para entrar no catálogo; só existe quando `ok`. */
  shortcut?: AudienceShortcut;
}

/** Acima disso o app não roda a contagem sozinho (o custo é do usuário, não do pacote). */
export const MAX_GB_CONTAGEM = 30;

/** Parâmetros nomeados (@nome) que a query usa de fato, sem contar comentários, textos e @@variáveis. */
export function usedParameters(sql: string): string[] {
  const limpo = stripSqlNoise(sql);
  return [...new Set([...limpo.matchAll(/(?<!@)@([a-z][a-z0-9_]*)/gi)].map((m) => m[1]!))];
}

const v = (id: string, rotulo: string, status: Verificacao['status'], detalhe?: string): Verificacao => ({ id, rotulo, status, ...(detalhe ? { detalhe } : {}) });

/** Erro de SQL do BigQuery (código 400) bloqueia; erro de rede, credencial ou cota só avisa. */
const isQueryError = (e: unknown) => (e as { code?: number } | null)?.code === 400;

export async function checkPackage(raw: unknown, existing: AudienceShortcut[], runner?: PackageRunner): Promise<CheckResult> {
  const out: Verificacao[] = [];
  const fail = (): CheckResult => ({ ok: false, verificacoes: out });

  const parsed = SegmentPackageSchema.safeParse(raw);
  if (!parsed.success) {
    out.push(v('formato', 'Formato do pacote', 'erro', parsed.error.issues.map((i) => `${i.path.join('.') || 'pacote'}: ${i.message}`).join('; ')));
    return fail();
  }
  const pkg = parsed.data;
  const seg = pkg.segmento;
  out.push(v('formato', 'Formato do pacote', 'ok'));

  const dup = existing.find((s) => s.id === seg.id || s.name.toLowerCase() === seg.name.toLowerCase());
  out.push(
    dup
      ? v('unico', 'Id e nome ainda não existem no catálogo', 'erro', `Já existe "${dup.name}" (${dup.id}).`)
      : v('unico', 'Id e nome ainda não existem no catálogo', 'ok'),
  );

  const guarda = guardAudienceSql(pkg.sql);
  out.push(guarda ? v('sql', 'Query: só leitura, um comando, coluna cuid', 'erro', guarda) : v('sql', 'Query: só leitura, um comando, coluna cuid', 'ok'));

  const declarados = (seg.parameters ?? []).map((p) => p.name);
  const usados = usedParameters(pkg.sql);
  const semDeclarar = usados.filter((n) => !declarados.includes(n));
  const semUso = declarados.filter((n) => !usados.includes(n));
  const duplicados = declarados.filter((n, i) => declarados.indexOf(n) !== i);
  const problemasParam = [
    ...semDeclarar.map((n) => `@${n} é usado na query mas não está em "parameters"`),
    ...semUso.map((n) => `"${n}" está em "parameters" mas a query não usa @${n}`),
    ...duplicados.map((n) => `"${n}" aparece duas vezes em "parameters"`),
  ];
  const padroes = resolveAudienceParams(seg.parameters);
  if (!padroes.ok) problemasParam.push(padroes.message);
  else
    for (const p of seg.parameters ?? [])
      if ((p.min !== undefined && p.default < p.min) || (p.max !== undefined && p.default > p.max)) problemasParam.push(`o padrão de "${p.name}" está fora de min/max`);
  out.push(
    problemasParam.length
      ? v('parametros', 'Parâmetros declarados = parâmetros usados', 'erro', problemasParam.join('; '))
      : v('parametros', 'Parâmetros declarados = parâmetros usados', 'ok', declarados.length ? declarados.map((n) => `@${n}`).join(', ') : 'sem parâmetros'),
  );

  if (out.some((x) => x.status === 'erro')) return fail();
  const params = padroes.ok ? padroes.values : {};

  let gigabytes: number | undefined;
  let clientes: number | undefined;
  if (!runner) {
    out.push(v('compila', 'Compila no BigQuery e devolve cuid', 'pulado', 'BigQuery indisponível neste ambiente.'));
    out.push(v('grao', 'Uma linha por cliente, cuid nunca nulo', 'pulado', 'Sem BigQuery para contar.'));
  } else {
    try {
      const d = await runner.dryRun(pkg.sql, params);
      gigabytes = d.gigabytes;
      if (!d.colunas.some((c) => c.toLowerCase() === 'cuid')) {
        out.push(v('compila', 'Compila no BigQuery e devolve cuid', 'erro', `A query compila, mas não devolve a coluna cuid (devolve: ${d.colunas.join(', ') || 'nenhuma'}).`));
      } else {
        out.push(v('compila', 'Compila no BigQuery e devolve cuid', 'ok', `${d.gigabytes.toLocaleString('pt-BR')} GB por execução`));
      }
    } catch (e) {
      const msg = (e as Error).message;
      out.push(isQueryError(e) ? v('compila', 'Compila no BigQuery e devolve cuid', 'erro', `O BigQuery recusou a query: ${msg}`) : v('compila', 'Compila no BigQuery e devolve cuid', 'aviso', `Não consegui conferir no BigQuery agora: ${msg}`));
    }

    const compilou = out.find((x) => x.id === 'compila')!.status === 'ok';
    if (compilou && (gigabytes ?? 0) > MAX_GB_CONTAGEM) {
      out.push(v('grao', 'Uma linha por cliente, cuid nunca nulo', 'aviso', `A query processa ${gigabytes} GB; não contei sozinho. Confira o grão antes de usar.`));
    } else if (compilou) {
      try {
        const c = await runner.count(pkg.sql, params);
        clientes = c.clientes;
        const probs = [
          ...(c.linhas !== c.clientes ? [`${c.linhas.toLocaleString('pt-BR')} linhas para ${c.clientes.toLocaleString('pt-BR')} clientes (precisa ser uma por cliente)`] : []),
          ...(c.semCuid > 0 ? [`${c.semCuid.toLocaleString('pt-BR')} linhas sem cuid`] : []),
          ...(c.clientes === 0 ? ['nenhum cliente entrou com os valores padrão'] : []),
        ];
        out.push(
          probs.length
            ? v('grao', 'Uma linha por cliente, cuid nunca nulo', 'erro', probs.join('; '))
            : v('grao', 'Uma linha por cliente, cuid nunca nulo', 'ok', `${c.clientes.toLocaleString('pt-BR')} clientes com os valores padrão`),
        );
      } catch (e) {
        out.push(isQueryError(e) ? v('grao', 'Uma linha por cliente, cuid nunca nulo', 'erro', (e as Error).message) : v('grao', 'Uma linha por cliente, cuid nunca nulo', 'aviso', `Não consegui contar agora: ${(e as Error).message}`));
      }
    } else {
      out.push(v('grao', 'Uma linha por cliente, cuid nunca nulo', 'pulado', 'A query precisa compilar antes.'));
    }
  }

  let share = seg.share;
  if (share === undefined && clientes !== undefined) share = Math.round((clientes / BASE_CLIENTES) * 10000) / 10000;
  if (share === undefined) out.push(v('share', 'Participação na base', 'erro', 'Informe "share" (0 a 1) no pacote: não deu para calcular pela contagem.'));
  else out.push(v('share', 'Participação na base', 'ok', `${(share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% (estimativa)`));

  const dyAttribute = seg.dyAttribute ?? `faro_aud_${seg.id.replaceAll('-', '_')}`;
  const resumo = { id: seg.id, name: seg.name, dyAttribute, ...(share !== undefined ? { share } : {}), ...(clientes !== undefined ? { clientes } : {}), ...(gigabytes !== undefined ? { gigabytes } : {}), parameters: declarados };
  if (out.some((x) => x.status === 'erro') || share === undefined) return { ok: false, verificacoes: out, resumo };

  const label = seg.descricao ? `Skill criar-segmento-faro · ${seg.descricao}` : 'Pacote da skill criar-segmento-faro';
  const shortcut = AudienceShortcutSchema.parse({
    id: seg.id,
    name: seg.name.trim(),
    share: Math.min(1, Math.max(0.0001, share)),
    dyAttribute,
    sql: pkg.sql.trim(),
    ...(seg.parameters?.length ? { parameters: seg.parameters } : {}),
    origin: { system: 'bigquery', label: label.slice(0, 160) },
  });
  return { ok: true, verificacoes: out, resumo, shortcut };
}
