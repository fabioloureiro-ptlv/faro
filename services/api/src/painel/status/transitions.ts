import { DecisionSchema } from '@faro/contracts';
import type {
  Decision,
  Experiment,
  ExperimentDecidedEvent,
  ExperimentStatus,
  ExperimentStatusChangedEvent,
} from '@faro/contracts';

// PNL-04: ciclo de vida do experimento. Funções puras; persistência e publicação
// dos eventos ficam com quem chama.

export type Role = 'experimentacao';

export type Actor =
  { kind: 'system' } | { kind: 'user'; email: string; squad?: string; roles: readonly Role[] };

export interface TransitionContext {
  actor: Actor;
  now: string; // ISO
  /** Houve exposição no export D-1 do DY. Só o sistema informa. */
  hasExposure?: boolean;
  /** Obrigatória para ir a `decidido` quando o experimento ainda não tem decisão. */
  decision?: Decision;
  reason?: string;
}

export type TransitionError =
  | 'status_terminal'
  | 'transicao_invalida'
  | 'sem_permissao'
  | 'somente_sistema'
  | 'sem_exposicao'
  | 'decisao_obrigatoria'
  | 'decisao_invalida';

export type TransitionEvent = ExperimentStatusChangedEvent | ExperimentDecidedEvent;

export type TransitionResult =
  | { ok: true; experiment: Experiment; events: TransitionEvent[] }
  | { ok: false; error: TransitionError; message: string };

export const TERMINAL_STATUSES: readonly ExperimentStatus[] = ['encerrado', 'cancelado'];

// Voltas para rascunho/design_completo existem porque editar o design reabre o gate da frente 1.
// DECISAO-PENDENTE: confirmar se `decidido` pode ir a `cancelado`. Hoje não pode: a decisão já
// foi registrada e o caminho é encerrar com o checklist (PNL-10).
export const TRANSITIONS: Readonly<Record<ExperimentStatus, readonly ExperimentStatus[]>> = {
  rascunho: ['design_completo', 'cancelado'],
  design_completo: ['rascunho', 'pronto_para_configurar', 'cancelado'],
  pronto_para_configurar: ['design_completo', 'configurado_no_dy', 'cancelado'],
  configurado_no_dy: ['rodando', 'cancelado'],
  rodando: ['decidido', 'cancelado'],
  decidido: ['encerrado'],
  encerrado: [],
  cancelado: [],
};

/** Status que só o sistema pode aplicar (derivados do export do DY). */
const SYSTEM_ONLY: readonly ExperimentStatus[] = ['rodando'];

export function canEdit(exp: Experiment, actor: Actor): boolean {
  if (actor.kind === 'system') return true;
  if (actor.roles.includes('experimentacao')) return true;
  // DECISAO-PENDENTE: quem pode alterar teste `ecossistema` de outro squad? Por ora só o
  // time de experimentação (opção conservadora; pergunta em aberto do spec da frente 2).
  if (exp.bu === 'ecossistema') return false;
  return !!actor.squad && actor.squad === exp.ownerSquad;
}

function fail(error: TransitionError, message: string): TransitionResult {
  return { ok: false, error, message };
}

export function transition(exp: Experiment, to: ExperimentStatus, ctx: TransitionContext): TransitionResult {
  const from = exp.status;

  if (TERMINAL_STATUSES.includes(from)) {
    return fail('status_terminal', `O experimento está ${from} e não muda mais de status.`);
  }
  if (!TRANSITIONS[from].includes(to)) {
    return fail('transicao_invalida', `Não é possível ir de ${from} para ${to}.`);
  }

  const isSystemOnly = SYSTEM_ONLY.includes(to);
  if (isSystemOnly && ctx.actor.kind !== 'system') {
    return fail('somente_sistema', `${to} é definido automaticamente quando há exposição no export do DY.`);
  }
  if (!isSystemOnly && ctx.actor.kind === 'system') {
    return fail('sem_permissao', `O sistema só aplica status derivados (${SYSTEM_ONLY.join(', ')}).`);
  }
  if (!canEdit(exp, ctx.actor)) {
    return fail('sem_permissao', 'Só o squad dono ou o time de experimentação podem mudar este status.');
  }

  if (to === 'rodando' && !ctx.hasExposure) {
    return fail('sem_exposicao', 'Ainda não há exposição no export do DY.');
  }

  let decision = exp.decision;
  const events: TransitionEvent[] = [];

  if (to === 'decidido') {
    if (!decision && !ctx.decision) {
      return fail('decisao_obrigatoria', 'Registre a decisão (resultado, justificativa, quem e quando).');
    }
    if (ctx.decision) {
      const parsed = DecisionSchema.safeParse(ctx.decision);
      if (!parsed.success)
        return fail('decisao_invalida', parsed.error.issues.map((i) => i.message).join('; '));
      decision = parsed.data;
      events.push({ type: 'experiment.decided', faroId: exp.faroId, decision, at: ctx.now });
    }
  }

  if (to === 'encerrado' && !decision) {
    return fail('decisao_obrigatoria', 'Encerrar exige decisão registrada.');
  }

  const actor = ctx.actor.kind === 'system' ? 'system' : ctx.actor.email;
  events.unshift({
    type: 'experiment.status_changed',
    faroId: exp.faroId,
    from,
    to,
    actor,
    ...(ctx.reason ? { reason: ctx.reason } : {}),
    at: ctx.now,
  });

  const experiment: Experiment = {
    ...exp,
    status: to,
    updatedAt: ctx.now,
    ...(decision ? { decision } : {}),
  };
  return { ok: true, experiment, events };
}

/** Destinos que o ator pode pedir a partir do status atual (para a UI). */
export function allowedTransitions(exp: Experiment, actor: Actor): ExperimentStatus[] {
  if (actor.kind === 'system' || !canEdit(exp, actor)) return [];
  return TRANSITIONS[exp.status].filter((s) => !SYSTEM_ONLY.includes(s));
}

/**
 * Derivação automática após a carga D-1: `configurado_no_dy` com exposição vira `rodando`.
 * Retorna `null` quando não há nada a derivar.
 */
export function deriveFromExposure(
  exp: Experiment,
  hasExposure: boolean,
  now: string,
): TransitionResult | null {
  if (exp.status !== 'configurado_no_dy' || !hasExposure) return null;
  return transition(exp, 'rodando', {
    actor: { kind: 'system' },
    now,
    hasExposure,
    reason: 'exposição no export D-1',
  });
}
