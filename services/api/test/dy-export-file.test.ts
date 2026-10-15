import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileDyExport, type DyExportFile } from '../src/adapters/dy-export-file.ts';
import { PM, setup, type Ctx } from './helpers.ts';

const FILE: DyExportFile = {
  generatedAt: '2026-10-14T12:00:00Z',
  windowStart: '2026-04-14',
  windowEnd: '2026-10-13',
  campaigns: [
    {
      campaignId: '111',
      campaignName: 'Home | Banner novo',
      labels: [],
      variations: ['[controle]', '[variante a]'],
      platforms: ['site'],
      pages: ['home'],
      firstSeen: '2026-06-01',
      observedSplit: [0.5, 0.5],
    },
    {
      campaignId: '222',
      campaignName: 'Busca | Ordenação',
      labels: [],
      variations: ['[controle]', '[variante a]'],
      platforms: ['android', 'ios'],
      pages: ['busca'],
      firstSeen: '2026-09-10',
      observedSplit: [0.5, 0.5],
    },
  ],
  snapshots: [
    {
      campaignId: '111',
      refdate: '2026-10-13',
      variations: [
        { name: '[controle]', users: 480 },
        { name: '[variante a]', users: 520 },
      ],
      platforms: ['site'],
    },
  ],
};

describe('adaptador de arquivo do export do DY', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'faro-dy-')), 'dy-campaigns.json');
  writeFileSync(path, JSON.stringify(FILE));
  const port = fileDyExport(path);

  it('encontra campanha por id e devolve undefined para desconhecida', async () => {
    expect((await port.getCampaign('111'))?.campaignName).toBe('Home | Banner novo');
    expect(await port.getCampaign('999')).toBeUndefined();
  });

  it('devolve snapshot por campanha e refdate', async () => {
    const snap = await port.getSnapshot('111', '2026-10-13');
    expect(snap?.variations).toHaveLength(2);
    expect(await port.getSnapshot('111', '2026-10-12')).toBeUndefined();
  });

  it('lista campanhas com a mais recente primeiro', async () => {
    const list = await port.listCampaigns();
    expect(list.map((c) => c.campaignId)).toEqual(['222', '111']);
  });

  it('expõe a janela sincronizada', () => {
    expect(port.meta()).toEqual({ generatedAt: '2026-10-14T12:00:00Z', windowStart: '2026-04-14', windowEnd: '2026-10-13' });
  });
});

describe('GET /experiments/dy-campaigns', () => {
  let ctx: Ctx;
  beforeAll(async () => (ctx = await setup()));
  afterAll(async () => ctx.close());

  it('lista as campanhas do export para a importação de legado', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/experiments/dy-campaigns', headers: PM });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as { campaignId: string; campaignName: string; firstSeen: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const first = rows.map((r) => r.firstSeen);
    expect([...first].sort().reverse()).toEqual(first);
  });
});
