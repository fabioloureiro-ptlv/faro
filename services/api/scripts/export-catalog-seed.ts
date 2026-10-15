// Gera um documento por segmento do catálogo atual do Faro (fixture + aprovados), no
// formato do banco do artefato "Segmentos". Uso: node scripts/export-catalog-seed.ts <pasta-saida>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudienceRuleSchema, type AudienceRule } from '@faro/contracts';
import { allShortcuts } from '../src/publico/custom.ts';
import { audienceRuleToSql } from '../src/publico/rule-sql.ts';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const out = process.argv[2];
if (!out) throw new Error('Informe a pasta de saída.');
mkdirSync(out, { recursive: true });

/** Descrição curta de uma regra, para o Claude do artefato decidir o que já existe no catálogo. */
function descreve(rule: AudienceRule): string {
  const partes = rule.conditions.map((c) => {
    if ('conditions' in c) return `(${descreve(c as AudienceRule)})`;
    if (c.type === 'comprou') return `comprou ${c.dimension} ${c.values.join(' ou ')} nos últimos ${c.windowDays} dias`;
    if (c.type === 'evento') return `evento ${c.eventName}${c.minCount && c.minCount > 1 ? ` ≥ ${c.minCount}x` : ''} nos últimos ${c.windowDays} dias`;
    if (c.type === 'propriedade') return `${c.key} ${c.op === 'neq' ? 'não é' : 'é'} ${c.values.join(' ou ')}`;
    return `plataforma ${c.values.join(' ou ')}`;
  });
  return partes.join(rule.op === 'and' ? ' E ' : ' OU ');
}

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
    ...(s.rule ? { rule: s.rule, descricao: descreve(AudienceRuleSchema.parse(s.rule)) } : {}),
    ...(s.sql ? { descricao: 'SQL livre importado do catálogo do Faro.' } : {}),
    ...(sql ? { sql } : {}),
    fonte: 'faro',
    status: 'aprovado',
    criadoEm: now,
  };
  writeFileSync(join(out, `${s.id}.json`), JSON.stringify(doc), 'utf-8');
  ids.push(s.id);
}
console.log(JSON.stringify(ids));
