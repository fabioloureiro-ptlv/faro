// Frente 3 — importação de segmentos aprovados fora do app (artefato "Segmentos").
// Quem monta o segmento por fora exporta um JSON com nome, regra e volumetria; aqui a
// regra é revalidada e o SQL regenerado pelo gerador do Faro (fonte única), então o
// catálogo nunca confia em SQL vindo de fora.
import { z } from 'zod';
import { AudienceRuleSchema, type AudienceShortcut } from '@faro/contracts';
import { slugAudienceId } from './custom.ts';
import { audienceRuleToSql } from './rule-sql.ts';

// DECISAO-PENDENTE: base de clientes com public_id em 14/10 (dim_cliente), usada
// para converter a volumetria contada em participação (share) do segmento novo.
export const BASE_CLIENTES = 15_270_545;

export const ImportItemSchema = z.object({
  name: z.string().trim().min(4, 'Nome com pelo menos 4 caracteres.').max(80),
  rule: AudienceRuleSchema,
  clientes: z.number().int().nonnegative().optional(),
  share: z.number().min(0).max(1).optional(),
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
    rule: input.rule,
  };
}

export interface ImportPlan {
  novos: AudienceShortcut[];
  ignorados: { name: string; motivo: 'formato_invalido' | 'ja_existe' | 'regra_nao_suportada'; detalhe: string }[];
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
    try {
      audienceRuleToSql(parsed.data.rule);
    } catch (e) {
      plan.ignorados.push({ name: shortcut.name, motivo: 'regra_nao_suportada', detalhe: (e as Error).message });
      continue;
    }
    plan.novos.push(shortcut);
    taken.push(shortcut);
  }
  return plan;
}
