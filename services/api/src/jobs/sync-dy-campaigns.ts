// Sincroniza o export do DY a partir do BigQuery (plano da frente 1, etapa 8).
// Gera services/api/.data/dy-campaigns.json, consumido por adapters/dy-export-file.ts.
//
// Uso: npm run job:sync-dy [-- --meses=6]
// Também exposto como syncDyCampaigns() para o POST /painel/dy-refresh.
// Credenciais: Application Default Credentials (gcloud auth application-default login).
// Regra do contexto geral: toda consulta com intervalo FECHADO de refdate (BETWEEN).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BigQuery } from '@google-cloud/bigquery';
import type { Platform } from '@faro/contracts';
import type { DyCampaignSnapshot } from '@faro/config-core';
import type { DyCampaignInfo } from '../ports.ts';
import type { DyExportFile } from '../adapters/dy-export-file.ts';

const PROJECT = 'petlove-dataeng-prod-01';
const VE = `\`${PROJECT}.ssot_dynamic_yield.variation_engagement\``;
const DAS = `\`${PROJECT}.ssot_dynamic_yield.daily_activity_stream\``;
/** Dias de histórico para split observado e snapshots D+1. */
const SPLIT_DAYS = 14;
/** Campanhas com mais variações que isso são Dynamic Content (listas de itens), não testes A/B. */
const MAX_VARIATIONS = 20;
/** Dias de histórico para inferência de plataformas (daily_activity_stream é cara). */
const PLATFORM_DAYS = 7;

const OUT = fileURLToPath(new URL('../../.data/dy-campaigns.json', import.meta.url));

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseArgs(): { meses: number } {
  const arg = process.argv.find((a) => a.startsWith('--meses='));
  const meses = arg ? Number(arg.split('=')[1]) : 6;
  if (!Number.isInteger(meses) || meses < 1 || meses > 24) throw new Error('--meses precisa ser um inteiro entre 1 e 24');
  return { meses };
}

/** D-1 como fim da janela: a partição do dia corrente pode estar incompleta. */
function windows(meses: number) {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - meses);
  const splitStart = new Date(end);
  splitStart.setDate(splitStart.getDate() - (SPLIT_DAYS - 1));
  const platformStart = new Date(end);
  platformStart.setDate(platformStart.getDate() - (PLATFORM_DAYS - 1));
  return { start: iso(start), end: iso(end), splitStart: iso(splitStart), platformStart: iso(platformStart) };
}

interface CampaignRow {
  campaign_id: string;
  campaign_name: string;
  first_seen: { value: string } | string;
  variations: string[];
}
interface SnapshotRow {
  campaign_id: string;
  refdate: { value: string } | string;
  name: string;
  users: number;
}
interface PlatformRow {
  campaign_id: string;
  operating_system: string | null;
  browser: string | null;
  eventos: number;
}
interface PageRow {
  campaign_id: string;
  path: string | null;
  eventos: number;
}

const dateOf = (v: { value: string } | string): string => (typeof v === 'string' ? v : v.value);

/** App: evento sem browser; site: com browser. Conservador: na dúvida, site. */
function toPlatforms(rows: PlatformRow[]): Platform[] {
  const out = new Set<Platform>();
  for (const r of rows) {
    const os = (r.operating_system ?? '').toLowerCase();
    const isApp = !r.browser || r.browser === 'N/I';
    if (isApp && os.includes('android')) out.add('android');
    else if (isApp && (os.includes('ios') || os.includes('iphone') || os.includes('ipad'))) out.add('ios');
    else out.add('site');
  }
  // DECISAO-PENDENTE: sem evento na janela de plataformas, assume site.
  return out.size ? [...out].sort() : ['site'];
}

export async function syncDyCampaigns(meses = 6): Promise<{ campaigns: number; snapshots: number; windowEnd: string }> {
  const w = windows(meses);
  console.log(`Sync DY: campanhas de ${w.start} a ${w.end} (split ${w.splitStart}+, plataformas ${w.platformStart}+)`);
  const bq = new BigQuery({ projectId: PROJECT });

  const run = async <T>(query: string, params: Record<string, string>): Promise<T[]> => {
    const [rows] = await bq.query({ query, params });
    return rows as T[];
  };

  const [campaignRows, snapshotRows, platformRows, pageRows] = await Promise.all([
    run<CampaignRow>(
      // Pré-agrega por dia (partição) antes de consolidar: agregação direta sobre
      // 6 meses de linhas cruas estoura a memória do BigQuery (resourcesExceeded).
      // Campanhas de Dynamic Content têm milhões de variation_names distintos
      // (estouram 100MB por linha) e não são testes A/B: ficam de fora.
      `WITH por_dia AS (
         SELECT campaign_id, refdate,
                ANY_VALUE(campaign_name) AS campaign_name,
                ARRAY_AGG(DISTINCT variation_names IGNORE NULLS LIMIT ${MAX_VARIATIONS + 1}) AS variations
         FROM ${VE}
         WHERE refdate BETWEEN @start AND @end AND campaign_id IS NOT NULL
         GROUP BY 1, 2
       )
       SELECT campaign_id,
              MAX_BY(campaign_name, refdate) AS campaign_name,
              MIN(refdate) AS first_seen,
              ARRAY_AGG(DISTINCT v IGNORE NULLS LIMIT ${MAX_VARIATIONS + 1}) AS variations
       FROM por_dia, UNNEST(variations) AS v
       GROUP BY campaign_id
       HAVING COUNT(DISTINCT v) <= ${MAX_VARIATIONS}`,
      { start: w.start, end: w.end },
    ),
    run<SnapshotRow>(
      `WITH validas AS (
         SELECT campaign_id
         FROM (
           SELECT campaign_id, variation_names
           FROM ${VE}
           WHERE refdate BETWEEN @start AND @end AND campaign_id IS NOT NULL AND variation_names IS NOT NULL
           GROUP BY 1, 2
         )
         GROUP BY campaign_id
         HAVING COUNT(*) <= ${MAX_VARIATIONS}
       )
       SELECT campaign_id, refdate, variation_names AS name, COUNT(DISTINCT dyid) AS users
       FROM ${VE}
       JOIN validas USING (campaign_id)
       WHERE refdate BETWEEN @start AND @end
         AND engagement_type = 'IMPRESSION' AND variation_names IS NOT NULL
       GROUP BY 1, 2, 3`,
      { start: w.splitStart, end: w.end },
    ),
    run<PlatformRow>(
      `SELECT campaign_id, operating_system, browser, COUNT(*) AS eventos
       FROM ${DAS}
       WHERE refdate BETWEEN @start AND @end AND event_type = 'VARIATION_ENGAGEMENT' AND campaign_id IS NOT NULL
       GROUP BY 1, 2, 3`,
      { start: w.platformStart, end: w.end },
    ),
    run<PageRow>(
      `SELECT campaign_id, REGEXP_EXTRACT(url_clean, r'https?://[^/]+(/[^?#]*)') AS path, COUNT(*) AS eventos
       FROM ${VE}
       WHERE refdate BETWEEN @start AND @end AND campaign_id IS NOT NULL AND url_clean IS NOT NULL
       GROUP BY 1, 2
       QUALIFY ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY eventos DESC) <= 3`,
      { start: w.splitStart, end: w.end },
    ),
  ]);

  const byCampaign = <T extends { campaign_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.campaign_id) ?? [];
      list.push(r);
      m.set(r.campaign_id, list);
    }
    return m;
  };
  const snapsBy = byCampaign(snapshotRows);
  const platsBy = byCampaign(platformRows);
  const pagesBy = byCampaign(pageRows);

  const campaigns: DyCampaignInfo[] = campaignRows.map((c) => {
    const snaps = snapsBy.get(c.campaign_id) ?? [];
    const platforms = toPlatforms(platsBy.get(c.campaign_id) ?? []);
    // Split observado: users únicos por variação somados na janela de split, na ordem de `variations`.
    const users = new Map<string, number>();
    for (const s of snaps) users.set(s.name, (users.get(s.name) ?? 0) + Number(s.users));
    const total = [...users.values()].reduce((a, b) => a + b, 0);
    const observedSplit = total ? c.variations.map((v) => Math.round(((users.get(v) ?? 0) / total) * 10000) / 10000) : [];
    const pages = (pagesBy.get(c.campaign_id) ?? [])
      .map((p) => (p.path === '/' || p.path === '' || p.path === null ? 'home' : p.path.split('/').filter(Boolean)[0] ?? 'home'))
      .filter((v, i, a) => a.indexOf(v) === i);
    return {
      campaignId: c.campaign_id,
      campaignName: c.campaign_name,
      labels: [], // o export não traz labels do console; vazio até a frente 4 resolver
      variations: c.variations,
      platforms,
      pages,
      firstSeen: dateOf(c.first_seen),
      observedSplit,
    };
  });

  const snapshots: DyCampaignSnapshot[] = [...snapsBy.entries()].flatMap(([campaignId, rows]) => {
    const platforms = toPlatforms(platsBy.get(campaignId) ?? []);
    const byDate = new Map<string, { name: string; users: number }[]>();
    for (const r of rows) {
      const d = dateOf(r.refdate);
      const list = byDate.get(d) ?? [];
      list.push({ name: r.name, users: Number(r.users) });
      byDate.set(d, list);
    }
    return [...byDate.entries()].map(([refdate, variations]) => ({ campaignId, refdate, variations, platforms }));
  });

  const out: DyExportFile = { generatedAt: new Date().toISOString(), windowStart: w.start, windowEnd: w.end, campaigns, snapshots };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`OK: ${campaigns.length} campanhas, ${snapshots.length} snapshots -> ${OUT}`);
  return { campaigns: campaigns.length, snapshots: snapshots.length, windowEnd: w.end };
}

// Só roda como CLI (npm run job:sync-dy); importado pela API, apenas exporta a função.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  syncDyCampaigns(parseArgs().meses).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
