// Adaptador interino do export do DY (o dado é da frente 4 — ver PEDIDOS.md):
// lê o JSON gerado por `npm run job:sync-dy` em services/api/.data/dy-campaigns.json.
// Sem o arquivo, `defaultPorts` segue no mock; os testes usam sempre o mock.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DyCampaignSnapshot } from '@faro/config-core';
import type { DyCampaignInfo, DyExportPort } from '../ports.ts';

export interface DyExportFile {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  campaigns: DyCampaignInfo[];
  snapshots: DyCampaignSnapshot[];
}

export const DY_EXPORT_PATH = fileURLToPath(new URL('../../.data/dy-campaigns.json', import.meta.url));

export function hasDyExportFile(path = DY_EXPORT_PATH): boolean {
  return existsSync(path);
}

export function fileDyExport(path = DY_EXPORT_PATH): DyExportPort & { meta: () => Pick<DyExportFile, 'generatedAt' | 'windowStart' | 'windowEnd'> } {
  // Leitura única no boot: o arquivo só muda quando o job de sync roda.
  const data = JSON.parse(readFileSync(path, 'utf-8')) as DyExportFile;
  return {
    async getCampaign(id) {
      return data.campaigns.find((c) => c.campaignId === id);
    },
    async getSnapshot(id, refdate) {
      return data.snapshots.find((s) => s.campaignId === id && s.refdate === refdate);
    },
    async listCampaigns() {
      return [...data.campaigns].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
    },
    meta: () => ({ generatedAt: data.generatedAt, windowStart: data.windowStart, windowEnd: data.windowEnd }),
  };
}
