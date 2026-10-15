import { describe, expect, it } from 'vitest';
import { EXPERIMENT_STATUSES, ExperimentSchema } from '@faro/contracts';
import type { Decision, Experiment, ExperimentStatus } from '@faro/contracts';
import fixtures from '@faro/contracts/fixtures/experiments.json';
import {
  TRANSITIONS,
  allowedTransitions,
  canEdit,
  deriveFromExposure,
  transition,
  type Actor,
  type TransitionContext,
} from './transitions.ts';

const NOW = '2026-10-14T12:00:00Z';
const all = fixtures.items.map((e) => ExperimentSchema.parse(e));
const byId = (id: string) => all.find((e) => e.faroId === id)!;

const frete = byId('FARO-2026-0002'); // ecom, Squad Checkout, rodando
const nexus = byId('FARO-2026-0001'); // ecossistema, decidido

const dono: Actor = { kind: 'user', email: 'dono@example.com', squad: 'Squad Checkout', roles: [] };
const outroSquad: Actor = { kind: 'user', email: 'outro@example.com', squad: 'Squad Saúde', roles: [] };
const experimentacao: Actor = {
  kind: 'user',
  email: 'xp@example.com',
  squad: 'Experimentação',
  roles: ['experimentacao'],
};
const system: Actor = { kind: 'system' };

const decision: Decision = {
  outcome: 'implementar_variante',
  rationale: 'Melhora confirmada na NORTE com amostra completa.',
  decidedBy: 'dono@example.com',
  decidedAt: '2026-10-14',
};

function withStatus(status: ExperimentStatus, extra: Partial<Experiment> = {}): Experiment {
  const { decision: _decision, ...rest } = frete;
  return { ...rest, status, ...extra };
}

/** Contexto que satisfaz todos os pré-requisitos de `to`, para isolar a validade da aresta. */
function happyCtx(to: ExperimentStatus): TransitionContext {
  if (to === 'rodando') return { actor: system, now: NOW, hasExposure: true };
  return { actor: experimentacao, now: NOW, decision };
}

describe('matriz de transições', () => {
  const pairs = EXPERIMENT_STATUSES.flatMap((from) => EXPERIMENT_STATUSES.map((to) => [from, to] as const));

  it.each(pairs)('%s → %s', (from, to) => {
    const exp = withStatus(from, from === 'decidido' ? { decision } : {});
    const r = transition(exp, to, happyCtx(to));
    expect(r.ok).toBe(TRANSITIONS[from].includes(to));
  });

  it('encerrado e cancelado são terminais', () => {
    for (const s of ['encerrado', 'cancelado'] as const) {
      const r = transition(withStatus(s, { decision }), 'rodando', happyCtx('rodando'));
      expect(r).toMatchObject({ ok: false, error: 'status_terminal' });
    }
  });
});

describe('rodando é derivado automaticamente', () => {
  const configurado = withStatus('configurado_no_dy');

  it('usuário não pode mover para rodando', () => {
    const r = transition(configurado, 'rodando', { actor: experimentacao, now: NOW, hasExposure: true });
    expect(r).toMatchObject({ ok: false, error: 'somente_sistema' });
  });

  it('sistema sem exposição não move', () => {
    const r = transition(configurado, 'rodando', { actor: system, now: NOW, hasExposure: false });
    expect(r).toMatchObject({ ok: false, error: 'sem_exposicao' });
  });

  it('sistema não aplica status manuais', () => {
    const r = transition(withStatus('rodando'), 'cancelado', { actor: system, now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'sem_permissao' });
  });

  it('deriveFromExposure move com exposição e registra actor system', () => {
    const r = deriveFromExposure(configurado, true, NOW);
    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.experiment.status).toBe('rodando');
      expect(r.events[0]).toMatchObject({
        type: 'experiment.status_changed',
        actor: 'system',
        to: 'rodando',
      });
    }
  });

  it('deriveFromExposure ignora sem exposição ou fora de configurado_no_dy', () => {
    expect(deriveFromExposure(configurado, false, NOW)).toBeNull();
    expect(deriveFromExposure(withStatus('rodando'), true, NOW)).toBeNull();
  });
});

describe('decisão', () => {
  it('decidido exige decisão', () => {
    const r = transition(withStatus('rodando'), 'decidido', { actor: dono, now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'decisao_obrigatoria' });
  });

  it('decisão inválida é rejeitada', () => {
    const r = transition(withStatus('rodando'), 'decidido', {
      actor: dono,
      now: NOW,
      decision: { ...decision, rationale: '' },
    });
    expect(r).toMatchObject({ ok: false, error: 'decisao_invalida' });
  });

  it('decidido grava a decisão e emite status_changed + decided', () => {
    const r = transition(withStatus('rodando'), 'decidido', { actor: dono, now: NOW, decision });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.experiment.decision).toEqual(decision);
      expect(r.experiment.updatedAt).toBe(NOW);
      expect(r.events.map((e) => e.type)).toEqual(['experiment.status_changed', 'experiment.decided']);
      expect(ExperimentSchema.safeParse(r.experiment).success).toBe(true);
    }
  });

  it('encerrado exige decisão registrada', () => {
    const r = transition(withStatus('decidido'), 'encerrado', { actor: experimentacao, now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'decisao_obrigatoria' });
  });

  it('encerrado com decisão existente passa e resultado valida no contrato', () => {
    const r = transition(withStatus('decidido', { decision }), 'encerrado', { actor: dono, now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(ExperimentSchema.safeParse(r.experiment).success).toBe(true);
  });
});

describe('permissões', () => {
  it('squad dono e experimentação editam; outro squad não', () => {
    expect(canEdit(frete, dono)).toBe(true);
    expect(canEdit(frete, experimentacao)).toBe(true);
    expect(canEdit(frete, outroSquad)).toBe(false);
  });

  it('outro squad recebe sem_permissao', () => {
    const r = transition(withStatus('rodando'), 'cancelado', { actor: outroSquad, now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'sem_permissao' });
  });

  it('ecossistema: só experimentação, nem o squad dono', () => {
    const squadNexus: Actor = { kind: 'user', email: 'n@example.com', squad: 'Nexus', roles: [] };
    expect(canEdit(nexus, squadNexus)).toBe(false);
    expect(canEdit(nexus, experimentacao)).toBe(true);
  });

  it('allowedTransitions omite rodando e respeita permissão', () => {
    expect(allowedTransitions(withStatus('configurado_no_dy'), dono)).toEqual(['cancelado']);
    expect(allowedTransitions(withStatus('rodando'), outroSquad)).toEqual([]);
    expect(allowedTransitions(nexus, experimentacao)).toEqual(['encerrado']);
  });
});

it('não muta o experimento de entrada', () => {
  const exp = withStatus('rodando');
  const snapshot = structuredClone(exp);
  transition(exp, 'decidido', { actor: dono, now: NOW, decision });
  expect(exp).toEqual(snapshot);
});

it('histórico das fixtures só usa transições válidas', async () => {
  const { default: audit } = await import('@faro/contracts/fixtures/audit-events.json');
  for (const e of audit.items) {
    if (e.type !== 'experiment.status_changed') continue;
    const from = e.from as ExperimentStatus;
    expect(TRANSITIONS[from], `${e.faroId} ${e.from}→${e.to}`).toContain(e.to);
    if (e.to === 'rodando') expect(e.actor).toBe('system');
  }
});
