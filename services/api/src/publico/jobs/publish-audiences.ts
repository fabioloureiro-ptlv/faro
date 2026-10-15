// Frente 3 — publicação de públicos no DY (SEG-07), interino.
// Para cada atalho com regra ou SQL versionado, materializa a lista de clientes
// (chv_cliente + cuid) em services/api/.data/audiences/<atributo>.csv.
// A subida via User Data API fica como DECISAO-PENDENTE (quem mantém a integração?
// pergunta aberta do spec); o cuid é o identificador que a DY reconhece
// (public_id = cuid dos eventos "Identify User", validado no segmentacao-ab).
//
// Uso: npm run job:publish-audiences [-- --atalho=<id>] [--dry-run]
// Orçamento (SEG-05): dry run antes de cada execução; acima de 50 GB o público é
// pulado, a menos que --forcar seja passado.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BigQuery } from '@google-cloud/bigquery';
import { AudienceRuleSchema, type AudienceShortcut } from '@faro/contracts';
import { allShortcuts } from '../custom.ts';
import { audienceRuleToSql, PROJECT } from '../rule-sql.ts';

const OUT_DIR = fileURLToPath(new URL('../../../.data/audiences', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../..', import.meta.url));
const BUDGET_BYTES = 50 * 1024 ** 3;

function args() {
  const only = process.argv.find((a) => a.startsWith('--atalho='))?.split('=')[1];
  return { only, dryRun: process.argv.includes('--dry-run'), force: process.argv.includes('--forcar') };
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
  const { only, dryRun, force } = args();
  const bq = new BigQuery({ projectId: PROJECT });
  mkdirSync(OUT_DIR, { recursive: true });
  const list = allShortcuts();

  for (const a of list) {
    if (only && a.id !== only) continue;
    if (!a.dyAttribute) continue;
    const sql = sqlFor(a);
    if (!sql) continue;

    const [job] = await bq.createQueryJob({ query: sql, dryRun: true });
    const bytes = Number(job.metadata.statistics.totalBytesProcessed);
    console.log(`${a.id}: dry run ${(bytes / 1e9).toFixed(1)} GB`);
    if (dryRun) continue;
    if (bytes > BUDGET_BYTES && !force) {
      console.warn(`${a.id}: acima do orçamento de 50 GB — pulado (use --forcar)`);
      continue;
    }

    const [rows] = await bq.query({ query: sql });
    const file = join(OUT_DIR, `${a.dyAttribute}.csv`);
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
