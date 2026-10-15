// Frente 3 — importação de segmentos aprovados fora do app (artefato "Segmentos").
// Quem monta o segmento por fora exporta um JSON com nome, query e volumetria. Se vier
// uma regra do construtor, o SQL é regenerado pelo gerador do Faro (fonte única); se vier
// SQL livre, ele passa pela guarda estática e por um dry run que confere a coluna `cuid`.
import { z } from 'zod';
import { AudienceRuleSchema, type AudienceShortcut } from '@faro/contracts';
import { slugAudienceId } from './custom.ts';
import { audienceRuleToSql } from './rule-sql.ts';
import { guardAudienceSql } from './sql-guard.ts';

// DECISAO-PENDENTE: base de clientes com public_id em 14/10 (dim_cliente), usada
// para converter a volumetria contada em participação (share) do segmento novo.
export const BASE_CLIENTES = 15_270_545;

export const ImportItemSchema = z
  .object({
    name: z.string().trim().min(4, 'Nome com pelo menos 4 caracteres.').max(80),
    rule: AudienceRuleSchema.optional(),
    sql: z.string().trim().min(1).optional(),
    clientes: z.number().int().nonnegative().optional(),
    share: z.number().min(0).max(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.rule && !v.sql) ctx.addIssue({ code: 'custom', message: 'Informe a regra ou o SQL do segmento.' });
    if (!v.rule && v.clientes == null && v.share == null)
      ctx.addIssue({ code: 'custom', message: 'Segmento com SQL precisa trazer a volumetria (clientes).' });
  });

export const ImportPayloadSchema = z.union([
  z.array(z.unknown()),
  z.object({ segmentos: z.array(z.unknown()) }).transform((o) => o.segmentos),
]);

export function buildShortcut(input: z.infer<typeof ImportItemSchema>): AudienceShortcut {
  const id = slugAudienceId(input.name);
  const share = input.share ?? (input.clientes != null ? Math.round((input.clientes / BASE_CLIENTES) * 10000) / 10000 : 1);
  return {
    id,
    name: input.name.trim(),
    share: Math.min(1, Math.max(0.0001, share)),
    dyAttribute: `faro_aud_${id.replaceAll('-', '_')}`,
    // O seletor de público do wizard agrupa os atalhos por origem.
    origin: {
      system: 'bigquery',
      label: input.rule ? 'regra do construtor de públicos, gerada em SQL (importada do artefato Segmentos)' : 'SQL livre aprovado no artefato Segmentos',
    },
    // Com regra, o SQL é sempre regenerado a partir dela; só sem regra o SQL livre é guardado.
    ...(input.rule ? { rule: input.rule } : { sql: input.sql }),
  };
}

export type IgnoredReason = 'formato_invalido' | 'ja_existe' | 'regra_nao_suportada' | 'sql_invalido';

export interface ImportPlan {
  novos: AudienceShortcut[];
  ignorados: { name: string; motivo: IgnoredReason; detalhe: string }[];
}

/** Decide o que entra no catálogo; não grava nada (quem chama persiste `novos`). */
export function planImport(items: unknown[], existing: AudienceShortcut[]): ImportPlan {
  const plan: ImportPlan = { novos: [], ignorados: [] };
  const taken = [...existing];
  for (const raw of items) {
    const label = String((raw as { name?: unknown } | null)?.name ?? '(sem nome)');
    const parsed = ImportItemSchema.safeParse(raw);
    if (!parsed.success) {
      plan.ignorados.push({ name: label, motivo: 'formato_invalido', detalhe: parsed.error.issues.map((i) => i.message).join('; ') });
      continue;
    }
    const shortcut = buildShortcut(parsed.data);
    if (!shortcut.id || taken.some((s) => s.id === shortcut.id || s.name.toLowerCase() === shortcut.name.toLowerCase())) {
      plan.ignorados.push({ name: shortcut.name, motivo: 'ja_existe', detalhe: 'Já existe um segmento com esse nome.' });
      continue;
    }
    if (parsed.data.rule) {
      try {
        audienceRuleToSql(parsed.data.rule);
      } catch (e) {
        plan.ignorados.push({ name: shortcut.name, motivo: 'regra_nao_suportada', detalhe: (e as Error).message });
        continue;
      }
    } else {
      const problema = guardAudienceSql(parsed.data.sql!);
      if (problema) {
        plan.ignorados.push({ name: shortcut.name, motivo: 'sql_invalido', detalhe: problema });
        continue;
      }
    }
    plan.novos.push(shortcut);
    taken.push(shortcut);
  }
  return plan;
}

/**
 * Segmentos com SQL livre só entram se a query compila no BigQuery e devolve `cuid`.
 * `dryRun` devolve os nomes das colunas do resultado (ou lança o erro do BigQuery).
 */
export async function verifySqlSegments(plan: ImportPlan, dryRun: (sql: string) => Promise<string[]>): Promise<ImportPlan> {
  const out: ImportPlan = { novos: [], ignorados: [...plan.ignorados] };
  for (const s of plan.novos) {
    if (!s.sql) {
      out.novos.push(s);
      continue;
    }
    try {
      const cols = await dryRun(s.sql);
      if (!cols.some((c) => c.toLowerCase() === 'cuid')) {
        out.ignorados.push({ name: s.name, motivo: 'sql_invalido', detalhe: `A query não devolve a coluna cuid (devolve: ${cols.join(', ') || 'nenhuma'}).` });
        continue;
      }
      out.novos.push(s);
    } catch (e) {
      out.ignorados.push({ name: s.name, motivo: 'sql_invalido', detalhe: `O BigQuery recusou a query: ${(e as Error).message}` });
    }
  }
  return out;
}
