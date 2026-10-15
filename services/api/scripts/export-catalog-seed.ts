// Gera um documento por segmento do catálogo atual do Faro (fixture + aprovados), no
// formato do banco do artefato "Segmentos". Uso: node scripts/export-catalog-seed.ts <pasta-saida>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudienceRuleSchema } from '@faro/contracts';
import { allShortcuts } from '../src/publico/custom.ts';
import { audienceRuleToSql } from '../src/publico/rule-sql.ts';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const out = process.argv[2];
if (!out) throw new Error('Informe a pasta de saída.');
mkdirSync(out, { recursive: true });

const now = new Date().toISOString();
const ids: string[] = [];
for (const s of allShortcuts()) {
  const sql = s.sqlRef
    ? readFileSync(join(REPO_ROOT, s.sqlRef), 'utf-8')
    : s.rule
      ? audienceRuleToSql(AudienceRuleSchema.parse(s.rule))
      : undefined;
  const doc = {
    name: s.name,
    origem: s.sqlRef ? 'sql-versionado' : s.rule ? 'regra' : 'manual',
    share: s.share,
    ...(s.dyAttribute ? { dyAttribute: s.dyAttribute } : {}),
    ...(s.rule ? { rule: s.rule } : {}),
    ...(sql ? { sql } : {}),
    fonte: 'faro',
    status: 'aprovado',
    criadoEm: now,
  };
  writeFileSync(join(out, `${s.id}.json`), JSON.stringify(doc), 'utf-8');
  ids.push(s.id);
}
console.log(JSON.stringify(ids));
