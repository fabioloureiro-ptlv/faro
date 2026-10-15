import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema.ts';

export type Db = PgliteDatabase<typeof schema>;

const MIGRATIONS = ['0001_init.sql'].map((f) => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));

/** `dataDir` ausente = banco em memória (testes). */
export async function createDb(dataDir?: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  for (const sql of MIGRATIONS) await client.exec(sql);
  return { db: drizzle(client, { schema }), close: () => client.close() };
}
