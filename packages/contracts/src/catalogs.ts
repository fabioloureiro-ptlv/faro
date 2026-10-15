// Formas das fixtures de apoio (catálogo de páginas, atalhos de público e templates).
// Provisórias: os donos (frentes 3 e 5) definem a forma final; ver docs/specs/PEDIDOS.md.
import { z } from 'zod';
import { AllocationSchema, AudienceRuleSchema, BuSchema, DesignSchema, PlatformSchema } from './schemas.ts';

export const PageCatalogEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  /** Usuários únicos por dia na página, todas as plataformas (dado simulado do protótipo). */
  dailyUsers: z.number().int().positive(),
});

export const PageCatalogSchema = z.object({
  pages: z.array(PageCatalogEntrySchema).min(1),
  platformShare: z.record(PlatformSchema, z.number().min(0).max(1)),
});

export const AudienceShortcutSchema = z.object({
  id: z.string(),
  name: z.string(),
  share: z.number().min(0).max(1),
  dyAttribute: z.string().optional(),
  /** Frente 3: regra estruturada do atalho (SEG-02/03), quando expressável no construtor. */
  rule: AudienceRuleSchema.optional(),
  /** Ids de atalhos declaradamente disjuntos deste (SEG-10), ex.: novos × recorrentes. */
  disjointWith: z.array(z.string()).optional(),
  /** SQL versionado em data/models/audiences quando a regra não cabe no construtor. */
  sqlRef: z.string().optional(),
});

/** Visão consumida pela frente 1. Provisório até a frente 5 publicar `Template`. */
export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  bu: BuSchema.optional(),
  design: DesignSchema.partial(),
  allocation: AllocationSchema.partial(),
});

export type PageCatalogEntry = z.infer<typeof PageCatalogEntrySchema>;
export type PageCatalog = z.infer<typeof PageCatalogSchema>;
export type AudienceShortcut = z.infer<typeof AudienceShortcutSchema>;
export type Template = z.infer<typeof TemplateSchema>;
