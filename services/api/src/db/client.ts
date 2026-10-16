import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzleMysql, type MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from './schema.ts';

// O tipo canônico é o MySQL (produção). O modo PGlite devolve a instância com um
// cast para este mesmo tipo: todo o código de consulta usa só a interseção dos
// dois dialetos (select/insert/update/delete/transaction, sem onDuplicateKeyUpdate,
// onConflictDoUpdate nem returning), e as colunas do schema mapeiam valores de
// forma idêntica nos dois bancos — é isso que os testes (PGlite) exercitam.
export type Db = MySql2Database<typeof schema>;

export type DbHandle = { db: Db; close: () => Promise<void> };

const migrations = (dir: string, files: string[]) =>
  files.map((f) => readFileSync(new URL(`./migrations/${dir}/${f}`, import.meta.url), 'utf8'));
const PG_MIGRATIONS = migrations('pglite', ['0001_init.sql']);
const MYSQL_MIGRATIONS = migrations('mysql', ['0001_init.sql']);

/** PGlite (dev local e testes). `dataDir` ausente = banco em memória. */
export async function createDb(dataDir?: string): Promise<DbHandle> {
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  for (const sql of PG_MIGRATIONS) await client.exec(sql);
  return { db: drizzlePglite(client) as unknown as Db, close: () => client.close() };
}

export type MysqlConfig =
  | { kind: 'url'; url: string }
  | { kind: 'cloud-sql'; instance: string; user: string; database: string; ipType?: string };

/**
 * Produção (AppBuilder): CLOUD_SQL_INSTANCE + DB_IAM_USER + DB_NAME, autenticação
 * IAM da service account, sem senha. Dev/validação: FARO_MYSQL_URL
 * (mysql://user:senha@host:porta/banco) tem precedência.
 */
export function mysqlConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MysqlConfig | undefined {
  if (env.FARO_MYSQL_URL) return { kind: 'url', url: env.FARO_MYSQL_URL };
  if (env.CLOUD_SQL_INSTANCE && env.DB_IAM_USER && env.DB_NAME)
    return { kind: 'cloud-sql', instance: env.CLOUD_SQL_INSTANCE, user: env.DB_IAM_USER, database: env.DB_NAME, ipType: env.CLOUD_SQL_IP_TYPE };
  return undefined;
}

export async function createMysqlDb(cfg: MysqlConfig): Promise<DbHandle> {
  // Imports dinâmicos: o modo PGlite (dev sem MySQL) não paga o custo destes módulos.
  const mysql = await import('mysql2/promise');
  let pool: import('mysql2/promise').Pool;
  let closeConnector: (() => void) | undefined;
  if (cfg.kind === 'url') {
    pool = mysql.createPool({ uri: cfg.url, connectionLimit: 5 });
  } else {
    const { Connector, AuthTypes, IpAddressTypes } = await import('@google-cloud/cloud-sql-connector');
    const connector = new Connector();
    const opts = await connector.getOptions({
      instanceConnectionName: cfg.instance,
      authType: AuthTypes.IAM,
      ipType: cfg.ipType === 'PRIVATE' ? IpAddressTypes.PRIVATE : IpAddressTypes.PUBLIC,
    });
    pool = mysql.createPool({ ...opts, user: cfg.user, database: cfg.database, connectionLimit: 5 });
    closeConnector = () => connector.close();
  }
  for (const stmt of MYSQL_MIGRATIONS.flatMap(splitStatements)) await pool.query(stmt);
  const db = drizzleMysql(pool, { schema, mode: 'default' });
  return {
    db,
    close: async () => {
      await pool.end();
      closeConnector?.();
    },
  };
}

/** Banco conforme o ambiente: MySQL quando configurado, senão PGlite em `dataDir`. */
export async function createDbFromEnv(dataDir?: string): Promise<DbHandle> {
  const cfg = mysqlConfigFromEnv();
  return cfg ? createMysqlDb(cfg) : createDb(dataDir);
}

/** Um statement por query: o mysql2 não executa multi-statement por padrão. */
function splitStatements(file: string): string[] {
  return file
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
