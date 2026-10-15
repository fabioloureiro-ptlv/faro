// Eventos de domínio expostos pela frente 1 (01-simplificacao-configuracao.md, seção 8).
import { z } from 'zod';
import { ConfigDivergenceSchema, ExperimentStatusSchema, FaroIdSchema } from './schemas.ts';

const base = {
  faroId: FaroIdSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  actor: z.string(),
};

export const ExperimentCreatedEventSchema = z.object({
  type: z.literal('experiment.created'),
  ...base,
  payload: z.object({ name: z.string(), legacy: z.boolean(), templateId: z.string().optional() }),
});

export const ExperimentDesignCompletedEventSchema = z.object({
  type: z.literal('experiment.design_completed'),
  ...base,
  payload: z.object({ primaryMetricId: z.string() }),
});

export const ExperimentConfiguredEventSchema = z.object({
  type: z.literal('experiment.configured'),
  ...base,
  payload: z.object({
    campaignId: z.string(),
    configuredBy: z.string(),
    configuredAt: z.iso.datetime({ offset: true }),
    previousStatus: ExperimentStatusSchema,
  }),
});

export const ExperimentConfigDivergenceEventSchema = z.object({
  type: z.literal('experiment.config_divergence'),
  ...base,
  payload: z.object({ divergences: z.array(ConfigDivergenceSchema).min(1) }),
});

export const FaroEventSchema = z.discriminatedUnion('type', [
  ExperimentCreatedEventSchema,
  ExperimentDesignCompletedEventSchema,
  ExperimentConfiguredEventSchema,
  ExperimentConfigDivergenceEventSchema,
]);

export type FaroEvent = z.infer<typeof FaroEventSchema>;
export type FaroEventType = FaroEvent['type'];
