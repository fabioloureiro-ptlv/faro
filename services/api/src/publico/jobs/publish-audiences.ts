// Frente 3 — publicação de públicos no DY (SEG-07), interino.
// Para cada atalho com regra ou SQL versionado, materializa a lista de clientes
// (chv_cliente + cuid) em services/api/.data/audiences/<atributo>.csv.
// A subida via User Data API fica como DECISAO-PENDENTE (quem mantém a integração?
// pergunta aberta do spec); o cuid é o identificador que a DY reconhece
// (public_id = cuid dos eventos "Identify User", validado no segmentacao-ab).
//
// Uso: npm run job:publish-audiences [-- --atalho=<id>] [--param=nome=valor] [--dry-run]
// Segmentos com parâmetros (ex.: dias_inadimplencia) usam o padrão do catálogo, ou o valor de
// --param; cada valor vira um atributo próprio no DY (faro_aud_inadimplentes_60, _90, ...).
// Orçamento (SEG-05): dry run antes de cada execução; acima de 50 GB o público é
// pulado, a menos que --forcar seja passado.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BigQuery } from '@google-cloud/bigquery';
import { AudienceRuleSchema, audienceAttributeFor, resolveAudienceParams, type AudienceShortcut } from '@faro/contracts';
import { allShortcuts } from '../custom.ts';
import { audienceRuleToSql, PROJECT } from '../rule-sql.ts';

const OUT_DIR = fileURLToPath(new URL('../../../.data/audiences', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../..', import.meta.url));
const BUDGET_BYTES = 50 * 1024 ** 3;

function args() {
  const only = process.argv.find((a) => a.startsWith('--atalho='))?.split('=')[1];
  const overrides: Record<string, string> = {};
  for (const a of process.argv.filter((x) => x.startsWith('--param='))) {
    const [name, value] = a.slice('--param='.length).split('=');
    if (name && value !== undefined) overrides[name] = value;
  }
  return { only, overrides, dryRun: process.argv.includes('--dry-run'), force: process.argv.includes('--forcar') };
}

function sqlFor(a: AudienceShortcut): string | undefined {
  if (a.sqlRef) {
    // SQL versionado pode ter mais colunas; a publicação só precisa de chv_cliente e cuid.
    const raw = readFileSync(join(REPO_ROOT, a.sqlRef), 'utf-8');
    return `SELECT chv_cliente, cuid FROM (\n${raw.replace(/;\s*$/, '')}\n) WHERE cuid IS NOT NULL`;
  }
  // SQL livre (segmento aprovado no artefato): 1 linha por cliente, com cuid; chv_cliente é opcional.
  if (a.sql) return `SELECT * FROM (\n${a.sql.replace(/;\s*$/, '')}\n) WHERE cuid IS NOT NULL`;
  if (a.rule) return audienceRuleToSql(AudienceRuleSchema.parse(a.rule));
  return undefined;
}

async function main() {
  const { only, overrides, dryRun, force } = args();
  const bq = new BigQuery({ projectId: PROJECT });
  mkdirSync(OUT_DIR, { recursive: true });
  const list = allShortcuts();

  for (const a of list) {
    if (only && a.id !== only) continue;
    if (!a.dyAttribute) continue;
    const sql = sqlFor(a);
    if (!sql) continue;

    // Só os --param que o segmento declara valem para ele; os demais são ignorados.
    const mine = Object.fromEntries(Object.entries(overrides).filter(([name]) => a.parameters?.some((p) => p.name === name)));
    const resolved = resolveAudienceParams(a.parameters, mine);
    if (!resolved.ok) {
      console.warn(`${a.id}: ${resolved.message} — pulado`);
      continue;
    }
    const params = Object.keys(resolved.values).length ? { params: resolved.values } : {};
    const attribute = audienceAttributeFor(a.dyAttribute, a.parameters, resolved.values)!;

    const [job] = await bq.createQueryJob({ query: sql, ...params, dryRun: true });
    const bytes = Number(job.metadata.statistics.totalBytesProcessed);
    console.log(`${a.id}: dry run ${(bytes / 1e9).toFixed(1)} GB`);
    if (dryRun) continue;
    if (bytes > BUDGET_BYTES && !force) {
      console.warn(`${a.id}: acima do orçamento de 50 GB — pulado (use --forcar)`);
      continue;
    }

    const [rows] = await bq.query({ query: sql, ...params });
    const file = join(OUT_DIR, `${attribute}.csv`);
    const comChave = rows.length > 0 && 'chv_cliente' in rows[0]!;
    const csv = comChave
      ? ['chv_cliente,cuid', ...rows.map((r) => `${r.chv_cliente},${r.cuid}`)].join('\n')
      : ['cuid', ...rows.map((r) => `${r.cuid}`)].join('\n');
    writeFileSync(file, csv, 'utf-8');
    console.log(`${a.id}: ${rows.length} clientes -> ${file}`);
  }
  console.log('DECISAO-PENDENTE: subida via User Data API do DY ainda manual (PEDIDOS.md).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
