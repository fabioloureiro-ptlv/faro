// MOCK do export do DY (frente 4). O adaptador real consultará o BigQuery sempre com intervalo
// fechado de refdate (ex.: refdate BETWEEN @d AND @d), nunca `refdate <= X`.
import type { Platform } from '@faro/contracts';
import type { DyCampaignSnapshot } from '@faro/config-core';
import type { DyCampaignInfo, DyExportPort } from '../ports.ts';
import { fx } from './fixtures.ts';

const n = fx.nexus.dyExport;

export const NEXUS_CAMPAIGN: DyCampaignInfo = {
  campaignId: n.campaignId,
  campaignName: n.campaignName,
  labels: n.labels,
  variations: n.variations.map((v) => v.name),
  platforms: n.platforms as Platform[],
  pages: ['home'],
  firstSeen: n.firstSeen,
  observedSplit: n.observedSplit,
};

/** Campanha legada fictícia, sem faroId, para demonstrar a importação com o banco semeado. */
export const LEGACY_SEARCH_CAMPAIGN: DyCampaignInfo = {
  campaignId: 'dy-busca-filtro-marca',
  campaignName: 'Busca | Filtro de marca no topo',
  labels: ['busca'],
  variations: ['Controle', 'Filtro no topo'],
  platforms: ['site'],
  pages: ['busca'],
  firstSeen: '2026-09-22',
  observedSplit: [0.5, 0.5],
};

/** Campanhas e snapshots em memória; testes podem registrar outros. */
export function mockDyExport(extra: { campaigns?: DyCampaignInfo[]; snapshots?: DyCampaignSnapshot[] } = {}): DyExportPort & {
  addSnapshot(s: DyCampaignSnapshot): void;
} {
  const campaigns = [NEXUS_CAMPAIGN, LEGACY_SEARCH_CAMPAIGN, ...(extra.campaigns ?? [])];
  const snapshots: DyCampaignSnapshot[] = [
    { campaignId: n.campaignId, refdate: n.refdate, variations: n.variations, platforms: n.platforms as Platform[] },
    ...(extra.snapshots ?? []),
  ];
  return {
    async getCampaign(id) {
      return campaigns.find((c) => c.campaignId === id);
    },
    async getSnapshot(id, refdate) {
      return snapshots.find((s) => s.campaignId === id && s.refdate === refdate);
    },
    async listCampaigns() {
      return [...campaigns].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
    },
    addSnapshot(s) {
      snapshots.push(s);
    },
  };
}
