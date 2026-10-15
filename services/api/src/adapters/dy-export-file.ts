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

// FARO_DY_EXPORT_PATH existe para os testes não lerem o export real sincronizado na máquina.
export const DY_EXPORT_PATH = process.env.FARO_DY_EXPORT_PATH ?? fileURLToPath(new URL('../../.data/dy-campaigns.json', import.meta.url));

export function hasDyExportFile(path = DY_EXPORT_PATH): boolean {
  return existsSync(path);
}

// Cache por caminho: o arquivo só muda quando o sync roda (job ou POST /painel/dy-refresh),
// que então chama invalidateDyExportCache() para a próxima leitura vir do disco.
const cacheByPath = new Map<string, DyExportFile>();

export function invalidateDyExportCache(): void {
  cacheByPath.clear();
}

export function fileDyExport(path = DY_EXPORT_PATH): DyExportPort & { meta: () => Pick<DyExportFile, 'generatedAt' | 'windowStart' | 'windowEnd'> } {
  const data = (): DyExportFile => {
    let d = cacheByPath.get(path);
    if (!d) {
      d = JSON.parse(readFileSync(path, 'utf-8')) as DyExportFile;
      cacheByPath.set(path, d);
    }
    return d;
  };
  return {
    async getCampaign(id) {
      return data().campaigns.find((c) => c.campaignId === id);
    },
    async getSnapshot(id, refdate) {
      return data().snapshots.find((s) => s.campaignId === id && s.refdate === refdate);
    },
    async listCampaigns() {
      return [...data().campaigns].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
    },
    meta: () => ({ generatedAt: data().generatedAt, windowStart: data().windowStart, windowEnd: data().windowEnd }),
  };
}
