// Popula o banco de desenvolvimento com as fixtures (Nexus + testes simulados).
import { sql } from 'drizzle-orm';
import { parseFaroId } from '@faro/config-core';
import type { Db } from './db/client.ts';
import { experiments } from './db/schema.ts';
import { bumpCounter, insertExperiment } from './experiments/repository.ts';
import { fx } from './mocks/fixtures.ts';

export async function seedFixtures(db: Db): Promise<number> {
  const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(experiments)) as [{ count: number }];
  if (count > 0) return 0;
  const all = [fx.nexus.experiment, ...fx.simulated.experiments.map(({ scenario: _s, ...e }) => e)];
  await db.transaction(async (tx) => {
    for (const e of all) {
      await insertExperiment(tx, e);
      const id = parseFaroId(e.faroId)!;
      await bumpCounter(tx, id.year, id.seq);
    }
  });
  return all.length;
}
