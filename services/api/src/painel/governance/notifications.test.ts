import { describe, expect, it } from 'vitest';
import { ExperimentSchema } from '@faro/contracts';
import type { GovernanceAlert } from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import { InMemoryNotifier, diffAlerts, dispatch, planNotifications, type Notifier } from './notifications.ts';

const exps = experiments.items.map((e) => ExperimentSchema.parse(e));

const alert = (over: Partial<GovernanceAlert>): GovernanceAlert => ({
  id: 'srm:FARO-2026-0004',
  faroId: 'FARO-2026-0004',
  rule: 'srm',
  severity: 'critico',
  message: 'Divisão desbalanceada.',
  suggestedAction: 'Investigar.',
  owner: 'squad-saude@example.com',
  createdAt: '2026-10-14',
  ...over,
});

describe('diffAlerts', () => {
  const prev = [
    alert({ createdAt: '2026-10-10' }),
    alert({ id: 'srm:FARO-2026-0001', faroId: 'FARO-2026-0001' }),
  ];
  const cur = [alert({}), alert({ id: 'parada_antecipada:FARO-2026-0002', faroId: 'FARO-2026-0002' })];
  const d = diffAlerts(prev, cur, '2026-10-14');

  it('separa novos, contínuos e resolvidos', () => {
    expect(d.opened.map((a) => a.id)).toEqual(['parada_antecipada:FARO-2026-0002']);
    expect(d.ongoing.map((a) => a.id)).toEqual(['srm:FARO-2026-0004']);
    expect(d.resolved.map((a) => a.id)).toEqual(['srm:FARO-2026-0001']);
  });

  it('contínuo preserva createdAt; resolvido ganha resolvedAt', () => {
    expect(d.ongoing[0]!.createdAt).toBe('2026-10-10');
    expect(d.resolved[0]!.resolvedAt).toBe('2026-10-14');
  });

  it('alerta resolvido antes que reaparece conta como novo', () => {
    const again = diffAlerts([alert({ resolvedAt: '2026-10-12' })], [alert({})], '2026-10-14');
    expect(again.opened).toHaveLength(1);
  });
});

describe('planNotifications', () => {
  const routing = {
    slackChannelByBu: { saude: '#saude-experimentos' },
    defaultSlackChannel: '#experimentacao',
  };

  it('dono por e-mail + canal da BU', () => {
    const ns = planNotifications([alert({})], exps, routing);
    expect(ns.map((n) => n.target)).toEqual([
      { kind: 'email', to: 'squad-saude@example.com' },
      { kind: 'slack', channel: '#saude-experimentos' },
    ]);
    expect(ns[0]!.subject).toBe(
      '[Faro · Crítico] Divisão desbalanceada (SRM) · Onboarding da Área Saúde em 3 passos',
    );
    expect(ns[0]!.text).toContain('Ação sugerida: Investigar.');
  });

  it('BU sem canal cai no padrão; sem padrão, só e-mail', () => {
    const ecom = alert({ id: 'x', faroId: 'FARO-2026-0002', owner: 'squad-checkout@example.com' });
    expect(planNotifications([ecom], exps, routing)[1]!.target).toEqual({
      kind: 'slack',
      channel: '#experimentacao',
    });
    expect(planNotifications([ecom], exps, { slackChannelByBu: {} })).toHaveLength(1);
  });

  it('órfã (sem faroId) vai para o time de experimentação', () => {
    const orfa = alert({
      id: 'campanha_orfa:dy-2001',
      faroId: undefined,
      dyCampaignId: 'dy-2001',
      rule: 'campanha_orfa',
      owner: 'time-experimentacao@example.com',
    });
    const ns = planNotifications([orfa], exps, routing);
    expect(ns.map((n) => n.target)).toEqual([
      { kind: 'email', to: 'time-experimentacao@example.com' },
      { kind: 'slack', channel: '#experimentacao' },
    ]);
    expect(ns[0]!.text.startsWith('Campanha dy-2001')).toBe(true);
  });
});

describe('dispatch', () => {
  it('envia tudo pelo notifier', async () => {
    const n = new InMemoryNotifier();
    const ns = planNotifications([alert({})], exps, { slackChannelByBu: { saude: '#s' } });
    expect(await dispatch(n, ns)).toEqual({ sent: 2, failed: [] });
    expect(n.sent).toHaveLength(2);
  });

  it('falha em um destino não impede os outros', async () => {
    const flaky: Notifier = {
      async send(x) {
        if (x.target.kind === 'slack') throw new Error('webhook fora');
      },
    };
    const ns = planNotifications([alert({})], exps, { slackChannelByBu: { saude: '#s' } });
    expect(await dispatch(flaky, ns)).toEqual({
      sent: 1,
      failed: [{ alertId: 'srm:FARO-2026-0004', kind: 'slack' }],
    });
  });
});
