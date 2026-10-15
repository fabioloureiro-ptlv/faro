import { afterEach, describe, expect, it } from 'vitest';
import { runConsistency } from '../src/jobs/run-consistency.ts';
import { PM, readyDraft, setup, type Ctx } from './helpers.ts';

let ctx: Ctx;
afterEach(async () => ctx?.close());

describe('checagem D+1 (CFG-13)', () => {
  it('split fora da tolerância vira evento config_divergence; Nexus importado não diverge', async () => {
    ctx = await setup();
    await ctx.app.inject({ method: 'POST', url: '/experiments/import-legacy', headers: PM, payload: { dyCampaignId: 'dy-nexus-home-app', bu: 'ecossistema', ownerSquad: 'Nexus' } });

    const r = await readyDraft(ctx);
    const id = r.experiment.faroId;
    await ctx.app.inject({ method: 'POST', url: `/experiments/${id}/ready`, headers: PM });
    await ctx.app.inject({ method: 'POST', url: `/experiments/${id}/dy-confirmation`, headers: PM, payload: { campaignId: 'dy-777', configuredBy: 'op@example.com', configuredAt: '2026-10-14T10:00:00Z' } });

    ctx.dyExport.addSnapshot({
      campaignId: 'dy-777',
      refdate: '2026-10-13',
      variations: [{ name: `${id}:controle`, users: 6000 }, { name: `${id}:a`, users: 4000 }],
      platforms: ['site', 'android', 'ios'],
    });

    const run = await runConsistency(ctx.db, ctx.ports, '2026-10-13');
    expect(run.checked).toBe(2);
    expect(run.divergences.map((d) => [d.faroId, d.kind])).toEqual([[id, 'split'], [id, 'split']]);
    const ev = (await ctx.app.inject({ url: `/events?faroId=${id}` })).json();
    expect(ev.at(-1)).toMatchObject({ type: 'experiment.config_divergence', actor: 'job:dy-consistency' });

    const none = await runConsistency(ctx.db, ctx.ports, '2026-10-12');
    expect(none.checked).toBe(0);
    expect(none.withoutData.sort()).toEqual(['FARO-2026-0001', id].sort());
  });
});
