// Frente 5 — templates (05-templates.md, seções 5 e 6). Templates são dados
// versionados, não código: as bibliotecas vivem em fixtures/ e, depois, em tabela.
import { z } from 'zod';
import { AllocationSchema, AudienceSchema, BuSchema, SignificanceLabelSchema } from './schemas.ts';

export const CampaignTemplateSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(['rascunho', 'publicado', 'arquivado']),
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string(),
  bu: BuSchema.optional(), // vazio = qualquer BU
  defaults: z.object({
    design: z
      .object({
        primaryMetricId: z.string().optional(),
        secondaryMetricIds: z.array(z.string()).optional(),
        guardrailMetricIds: z.array(z.string()).optional(),
        mdeRelative: z.number().positive().optional(),
      })
      .optional(),
    hypothesisHint: z.string().optional(),
    contextChecklist: z.array(z.string()).optional(),
    audience: AudienceSchema.partial().optional(),
    allocation: AllocationSchema.partial().optional(),
    dy: z
      .object({
        campaignType: z.string(),
        namingPattern: z.string(),
        labels: z.array(z.string()),
        checklist: z.array(z.string()),
      })
      .optional(),
  }),
  /** Campos que o usuário não pode alterar (ex.: guardrail obrigatório), com o motivo na UI. */
  lockedFields: z.array(z.string()).optional(),
  owner: z.string(),
  updatedAt: z.string(),
});

export type CampaignTemplate = z.infer<typeof CampaignTemplateSchema>;

export const ReportTemplateSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  sections: z.array(z.object({ key: z.string(), title: z.string(), visible: z.boolean(), order: z.number().int() })),
  metricSections: z.array(z.object({ key: z.string(), title: z.string(), metricIds: z.array(z.string()).optional() })),
  /** Textos padrão (avisos, explicação dos rótulos, metodologia), editáveis sem deploy. */
  copy: z.record(z.string(), z.string()),
  labels: z.record(
    SignificanceLabelSchema,
    z.object({ text: z.string(), tone: z.enum(['ok', 'risk', 'warn', 'neutral']) }),
  ),
});

export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;
