// Garante que a guarda de SQL embutida no artefato "Segmentos" continua idêntica a
// guardAudienceSql. Uso: node scripts/check-artifact-sql.ts <segmentos-faro.html>
import { readFileSync } from 'node:fs';
import { guardAudienceSql } from '../src/publico/sql-guard.ts';

const html = readFileSync(process.argv[2]!, 'utf-8');
const start = html.indexOf('// guarda:inicio');
const end = html.indexOf('// guarda:fim');
if (start < 0 || end < 0) throw new Error('Marcadores da guarda não encontrados no HTML.');
const port = new Function(`${html.slice(start, end)}; return guardSql;`)() as (sql: string) => string | null;

const casos = [
  'SELECT public_id AS cuid FROM `p.d.t`',
  'WITH a AS (SELECT 1) SELECT cuid FROM a;',
  '',
  'SELECT 1; SELECT cuid FROM t',
  'DELETE FROM `x.y.z` WHERE cuid IS NOT NULL',
  'SELECT cuid FROM t WHERE x IN (SELECT 1) UNION ALL SELECT cuid FROM (DROP TABLE a)',
  'SELECT chv_cliente FROM t',
  "-- cria lista de update\nSELECT public_id AS cuid, 'drop table' AS nota, dt_update, `p.d.create_log` FROM `p.d.t`",
  'SELECT /* insert */ cuid FROM t',
];
let ok = true;
for (const c of casos) {
  const igual = port(c) === guardAudienceSql(c);
  ok &&= igual;
  console.log(`${igual ? 'idêntico' : 'DIFERENTE'}: ${JSON.stringify(c.slice(0, 50))}`);
}
if (!ok) process.exit(1);
