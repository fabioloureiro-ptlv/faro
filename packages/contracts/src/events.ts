// Eventos de domínio expostos pela frente 1 (01-simplificacao-configuracao.md, seção 8).
import { z } from 'zod';
import {
  ConfigDivergenceSchema,
  DecisionSchema,
  ExperimentStatusSchema,
  FaroIdSchema,
} from './schemas.ts';

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

// Unificação (frente 2): transições de status e decisão também entram no outbox.
export const ExperimentStatusChangedOutboxSchema = z.object({
  type: z.literal('experiment.status_changed'),
  ...base,
  payload: z.object({
    from: ExperimentStatusSchema,
    to: ExperimentStatusSchema,
    reason: z.string().optional(),
  }),
});

export const ExperimentDecidedOutboxSchema = z.object({
  type: z.literal('experiment.decided'),
  ...base,
  payload: z.object({ decision: DecisionSchema }),
});

// 0.6.0: aviso do teste pronto para configurar (resumo no Slack e card no Jira para quem opera o DY).
export const ExperimentAnnouncedEventSchema = z.object({
  type: z.literal('experiment.announced'),
  ...base,
  payload: z.object({
    slack: z.object({ channel: z.string().optional() }).optional(),
    jira: z.object({ key: z.string(), url: z.string() }).optional(),
  }),
});

export const FaroEventSchema = z.discriminatedUnion('type', [
  ExperimentCreatedEventSchema,
  ExperimentDesignCompletedEventSchema,
  ExperimentConfiguredEventSchema,
  ExperimentConfigDivergenceEventSchema,
  ExperimentStatusChangedOutboxSchema,
  ExperimentDecidedOutboxSchema,
  ExperimentAnnouncedEventSchema,
]);

export type FaroEvent = z.infer<typeof FaroEventSchema>;
export type FaroEventType = FaroEvent['type'];
