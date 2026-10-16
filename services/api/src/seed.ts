// Popula o banco de desenvolvimento com as fixtures: o Nexus (teste real importado)
// e três simulados como exemplos, renomeados "Exemplo - …" (ajuste de produto 15/10:
// os testes reais ativos vêm do export da DY, não de fixture).
import { count } from 'drizzle-orm';
import { parseFaroId } from '@faro/config-core';
import type { Db } from './db/client.ts';
import { experiments } from './db/schema.ts';
import { bumpCounter, insertExperiment } from './experiments/repository.ts';
import { fx } from './mocks/fixtures.ts';

/** Um exemplo por estado: rodando com SRM, agendado e encerrado com vencedor. */
const EXEMPLOS = new Set(['FARO-2026-0004', 'FARO-2026-0005', 'FARO-2026-0006']);

export async function seedFixtures(db: Db): Promise<number> {
  // count() do drizzle em vez de count(*)::int: o cast `::` é só Postgres.
  const [{ total }] = (await db.select({ total: count() }).from(experiments)) as [{ total: number }];
  if (total > 0) return 0;
  const exemplos = fx.simulated.experiments
    .filter((e) => EXEMPLOS.has(e.faroId))
    .map(({ scenario: _s, ...e }) => ({ ...e, name: `Exemplo - ${e.name}` }));
  const all = [fx.nexus.experiment, ...exemplos];
  await db.transaction(async (tx) => {
    for (const e of all) await insertExperiment(tx, e);
    // O contador avança pelo maior seq das fixtures (inseridas ou não), para os
    // ids novos não colidirem com os simulados que ficaram de fora.
    for (const e of [fx.nexus.experiment, ...fx.simulated.experiments]) {
      const id = parseFaroId(e.faroId)!;
      await bumpCounter(tx, id.year, id.seq);
    }
  });
  return all.length;
}
