import { mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp, defaultPorts } from './app.ts';
import { createDb } from './db/client.ts';
import { seedFixtures } from './seed.ts';

const port = Number(process.env.FARO_API_PORT ?? 4000);
// fileURLToPath, não .pathname: no Windows o pathname vira "/C:/..." e quebra o mkdir.
const dataDir = process.env.FARO_DATA_DIR ?? fileURLToPath(new URL('../.data/pglite', import.meta.url));
mkdirSync(dataDir, { recursive: true });

// O PGlite em disco corrompe quando o processo é morto no meio de uma escrita (comum no
// dev com --watch ou ao parar o servidor). Em vez de travar o boot, a pasta estragada é
// guardada ao lado e o banco é recriado a partir das fixtures; rascunhos locais se perdem.
async function openDb() {
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
