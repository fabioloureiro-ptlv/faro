import { describe, expect, it } from 'vitest';
import { DyCampaignStatusSchema, ExperimentSchema } from '@faro/contracts';
import type { DyCampaignStatus } from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import campaigns from '@faro/contracts/fixtures/dy-campaigns.json';
import { closeExperiment, decideExperiment } from './commands.ts';
import type { Actor } from './transitions.ts';

const byId = (id: string) => ExperimentSchema.parse(experiments.items.find((e) => e.faroId === id));
const camp = (id: string) => DyCampaignStatusSchema.parse(campaigns.items.find((c) => c.campaignId === id));
const NOW = '2026-10-15T14:00:00Z';
const dono: Actor = { kind: 'user', email: 'pm@example.com', squad: 'Squad Checkout', roles: [] };
const outro: Actor = { kind: 'user', email: 'x@example.com', squad: 'Squad Saúde', roles: [] };
const xp: Actor = { kind: 'user', email: 'xp@example.com', roles: ['experimentacao'] };

const frete = byId('FARO-2026-0002'); // rodando, Squad Checkout
const nexus = byId('FARO-2026-0001'); // decidido, ecossistema

describe('decideExperiment (PNL-09)', () => {
  const input = { outcome: 'manter_controle', rationale: '  NORTE sem diferença e GUARDA estável.  ' };

  it('registra decisão com autor e data do ator, e vai a decidido', () => {
    const r = decideExperiment(frete, input, { actor: dono, now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.experiment.status).toBe('decidido');
      expect(r.experiment.decision).toEqual({
        outcome: 'manter_controle',
        rationale: 'NORTE sem diferença e GUARDA estável.',
        decidedBy: 'pm@example.com',
        decidedAt: '2026-10-15',
      });
      expect(ExperimentSchema.safeParse(r.experiment).success).toBe(true);
    }
  });

  it.each([
    [{ outcome: 'ganhou', rationale: 'x' }],
    [{ outcome: 'manter_controle', rationale: '   ' }],
    [{ outcome: 'manter_controle' }],
    [null],
    ['texto'],
  ])('entrada inválida %j', (bad) => {
    expect(decideExperiment(frete, bad, { actor: dono, now: NOW })).toMatchObject({
      ok: false,
      error: 'entrada_invalida',
    });
  });

  it('ignora campos extras como decidedBy vindos do cliente', () => {
    const r = decideExperiment(
      frete,
      { ...input, decidedBy: 'outra@example.com' },
      { actor: dono, now: NOW },
    );
    expect(r.ok && r.experiment.decision?.decidedBy).toBe('pm@example.com');
  });

  it('outro squad não decide', () => {
    expect(decideExperiment(frete, input, { actor: outro, now: NOW })).toMatchObject({
      ok: false,
      error: 'sem_permissao',
    });
  });

  it('não decide teste que não está rodando', () => {
    expect(decideExperiment(byId('FARO-2026-0005'), input, { actor: xp, now: NOW })).toMatchObject({
      ok: false,
      error: 'transicao_invalida',
    });
  });
});

describe('closeExperiment (PNL-10)', () => {
  const learningUrl = 'https://wiki.example.com/aprendizados/nexus';
  const off: DyCampaignStatus = { ...camp('dy-1001'), active: false, asOf: '2026-10-14' };

  it('bloqueia com checklist incompleto e diz o que falta', () => {
    const r = closeExperiment(nexus, { learningUrl }, { actor: xp, now: NOW, campaign: camp('dy-1001') });
    expect(r).toMatchObject({
      ok: false,
      error: 'checklist_incompleto',
      message: 'Falta: campanha desligada no DY.',
    });
  });

  it('encerra com checklist completo e grava o link na decisão', () => {
    const r = closeExperiment(nexus, { learningUrl }, { actor: xp, now: NOW, campaign: off });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.experiment.status).toBe('encerrado');
      expect(r.experiment.decision?.learningUrl).toBe(learningUrl);
      expect(r.events[0]).toMatchObject({ to: 'encerrado', reason: 'checklist de encerramento completo' });
      expect(ExperimentSchema.safeParse(r.experiment).success).toBe(true);
    }
  });

  it('link sem https é entrada inválida', () => {
    expect(
      closeExperiment(nexus, { learningUrl: 'javascript:alert(1)' }, { actor: xp, now: NOW, campaign: off }),
    ).toMatchObject({ ok: false, error: 'entrada_invalida' });
  });

  it('respeita permissão: squad dono do ecossistema não encerra', () => {
    const squadNexus: Actor = { kind: 'user', email: 'n@example.com', squad: 'Nexus', roles: [] };
    expect(
      closeExperiment(nexus, { learningUrl }, { actor: squadNexus, now: NOW, campaign: off }),
    ).toMatchObject({
      ok: false,
      error: 'sem_permissao',
    });
  });
});
