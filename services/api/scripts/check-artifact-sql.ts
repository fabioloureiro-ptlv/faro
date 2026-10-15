// Garante que a porta JS do gerador de SQL, embutida no artefato "Segmentos", continua
// idêntica a audienceRuleToSql. Uso: node scripts/check-artifact-sql.ts <segmentos-faro.html>
import { readFileSync } from 'node:fs';
import { audienceRuleToSql } from '../src/publico/rule-sql.ts';
import type { AudienceRule } from '@faro/contracts';

const html = readFileSync(process.argv[2]!, 'utf-8');
const start = html.indexOf('function esc(');
const end = html.indexOf('// Mesmas regras do AudienceRuleSchema');
if (start < 0 || end < 0) throw new Error('Marcadores do gerador não encontrados no HTML.');
const port = new Function(
  `var PROJECT = 'petlove-dataeng-prod-01'; ${html.slice(start, end)}; return audienceSql;`,
)() as (r: AudienceRule) => string;

const rules: AudienceRule[] = [
  { op: 'and', conditions: [{ type: 'comprou', dimension: 'categoria', values: ['cachorro/racoes', "d'ouro"], windowDays: 180 }, { type: 'propriedade', key: 'especie_pet', op: 'eq', values: ['gato', 'cachorro'] }] },
  { op: 'or', conditions: [{ type: 'comprou', dimension: 'marca', values: ['golden'], windowDays: 30 }, { type: 'comprou', dimension: 'item', values: ['A1', 'B2'], windowDays: 365 }] },
  { op: 'and', conditions: [{ type: 'evento', eventName: 'add_to_cart', windowDays: 30, minCount: 3 }, { type: 'propriedade', key: 'clube', op: 'neq', values: ['1'] }, { type: 'propriedade', key: 'plano_saude', op: 'eq', values: ['1'] }] },
  { op: 'and', conditions: [{ type: 'comprou', dimension: 'categoria', values: ["x\\' OR 1=1 --"], windowDays: 7 }, { type: 'evento', eventName: "e'v", windowDays: 7 }] },
];
let ok = true;
rules.forEach((r, i) => {
  const same = port(r) === audienceRuleToSql(r);
  ok &&= same;
  console.log(`regra ${i + 1}: ${same ? 'idêntico' : 'DIFERENTE'}`);
});
if (!ok) process.exit(1);
