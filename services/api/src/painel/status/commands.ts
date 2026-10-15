import { z } from 'zod';
import { DecisionSchema, HttpsUrlSchema } from '@faro/contracts';
import type { DyCampaignStatus, Experiment } from '@faro/contracts';
import { closingChecklist, type ClosingChecklist } from './closing.ts';
import { transition, type Actor, type TransitionResult } from './transitions.ts';

// PNL-09 e PNL-10: comandos que a API expõe. Validam a entrada não confiável e delegam
// a regra de ciclo de vida para `transition`.

export const DecideInputSchema = z.object({
  outcome: DecisionSchema.shape.outcome,
  rationale: z.string().trim().min(1, 'Escreva a justificativa.').max(4000),
});
export type DecideInput = z.infer<typeof DecideInputSchema>;

export const CloseInputSchema = z.object({
  learningUrl: HttpsUrlSchema.max(2000),
});
export type CloseInput = z.infer<typeof CloseInputSchema>;

export type CommandResult =
  | TransitionResult
  | { ok: false; error: 'entrada_invalida'; message: string }
  | { ok: false; error: 'checklist_incompleto'; message: string; checklist: ClosingChecklist };

const issues = (e: z.ZodError) => e.issues.map((i) => i.message).join('; ');

/** Registra a decisão e leva o teste de `rodando` para `decidido`. */
export function decideExperiment(
  exp: Experiment,
  input: unknown,
  ctx: { actor: Actor; now: string },
): CommandResult {
  const parsed = DecideInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'entrada_invalida', message: issues(parsed.error) };
  if (ctx.actor.kind !== 'user')
    return { ok: false, error: 'sem_permissao', message: 'Decisão exige uma pessoa.' };
  return transition(exp, 'decidido', {
    actor: ctx.actor,
    now: ctx.now,
    decision: {
      outcome: parsed.data.outcome,
      rationale: parsed.data.rationale,
      decidedBy: ctx.actor.email,
      decidedAt: ctx.now.slice(0, 10),
    },
  });
}

/** Encerra (`decidido` → `encerrado`) só com o checklist completo; grava o link do aprendizado. */
export function closeExperiment(
  exp: Experiment,
  input: unknown,
  ctx: { actor: Actor; now: string; campaign: DyCampaignStatus | undefined },
): CommandResult {
  const parsed = CloseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'entrada_invalida', message: issues(parsed.error) };

  const checklist = closingChecklist(exp, ctx.campaign, parsed.data.learningUrl);
  if (!checklist.ready) {
    const pending = checklist.items
      .filter((i) => !i.done)
      .map((i) => i.label.charAt(0).toLowerCase() + i.label.slice(1));
    return { ok: false, error: 'checklist_incompleto', message: `Falta: ${pending.join(', ')}.`, checklist };
  }

  const result = transition(exp, 'encerrado', {
    actor: ctx.actor,
    now: ctx.now,
    reason: 'checklist de encerramento completo',
  });
  if (!result.ok) return result;
  const decision = { ...result.experiment.decision!, learningUrl: parsed.data.learningUrl };
  return { ...result, experiment: { ...result.experiment, decision } };
}
