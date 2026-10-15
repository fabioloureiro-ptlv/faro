import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp, defaultPorts } from './app.ts';
import { createDb } from './db/client.ts';
import { seedFixtures } from './seed.ts';

const port = Number(process.env.FARO_API_PORT ?? 4000);
// fileURLToPath, não .pathname: no Windows o pathname vira "/C:/..." e quebra o mkdir.
const dataDir = process.env.FARO_DATA_DIR ?? fileURLToPath(new URL('../.data/pglite', import.meta.url));
mkdirSync(dataDir, { recursive: true });

// Encerrar o processo à força (dev com --watch, parar o servidor) deixa o `postmaster.pid`
// da execução anterior na pasta, e o PGlite se recusa a abrir com ele ("failed to initialize").
// Só este processo usa a pasta, então a trava velha é removida antes de abrir: os dados estão
// íntegros. Só se mesmo assim o banco não abrir, a pasta é guardada ao lado e recriada das
// fixtures (aí os rascunhos locais ficam na pasta guardada, fora do banco em uso).
async function openDb() {
  rmSync(`${dataDir}/postmaster.pid`, { force: true });
  try {
    return await createDb(dataDir);
  } catch (e) {
    const aside = `${dataDir}-corrompido-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    console.warn(`Banco local ilegível (${(e as Error).message}). Guardando em ${aside} e recriando das fixtures.`);
    renameSync(dataDir, aside);
    mkdirSync(dataDir, { recursive: true });
    return await createDb(dataDir);
  }
}

const { db } = await openDb();
const seeded = await seedFixtures(db);
const app = await buildApp(db, defaultPorts(db), {
  logger: true,
  corsOrigin: (process.env.FARO_WEB_ORIGIN ?? 'http://localhost:3000').split(','),
});
if (seeded) app.log.info(`${seeded} experimentos de fixture carregados`);
await app.listen({ port, host: '127.0.0.1' });
